import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { listStudies } from "@/lib/server/ledger";
import { deleteFileAsset, uploadGeneratedProjectFile } from "@/lib/server/files";
import type { ScopeInput } from "@/lib/server/scope";
import type { DraftStateInput } from "@/lib/draftStorage";
import type { FileAsset } from "@/types/files";
import type { DraftExportFormat, DraftExportMode } from "@/lib/draft-export/model";
import { compileDraftExportDocument } from "@/lib/draft-export/compile";
import { renderMarkdownExport } from "@/lib/draft-export/render-markdown";
import { renderDocxExport } from "@/lib/draft-export/render-docx";
import { createDraftCheckpoint } from "@/lib/server/draft-checkpoints";
import { logServerError } from "@/lib/server/logging";

function slugifyFilename(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-") || "draft";
}

function exportMimeType(format: DraftExportFormat): string {
  if (format === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return "text/markdown";
}

async function getNextExportVersion(
  scopeInput: ScopeInput,
  projectId: string,
  format: DraftExportFormat,
): Promise<number> {
  await assertProjectAccess(scopeInput, projectId);
  const latest = await prisma.fileAsset.findFirst({
    where: {
      projectId,
      kind: "export",
      format,
    },
    orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export async function generateDraftExport(
  scopeInput: ScopeInput,
  projectId: string,
  draftSnapshot: DraftStateInput,
  options: { format: DraftExportFormat; mode: DraftExportMode }
): Promise<FileAsset> {
  await assertProjectAccess(scopeInput, projectId);

  const [project, studies, nextVersion] = await Promise.all([
    prisma.project.findFirst({
      where: { id: projectId },
      select: { name: true },
    }),
    listStudies(scopeInput, projectId),
    getNextExportVersion(scopeInput, projectId, options.format),
  ]);

  if (!project) {
    throw new Error("Project not found or access denied.");
  }

  const compiled = compileDraftExportDocument({
    projectTitle: project.name,
    draftSnapshot,
    studies,
  });

  if (options.mode === "strict" && compiled.blockingWarningCount > 0) {
    throw new Error("Export blocked in strict mode: fix missing citation targets before exporting.");
  }

  const bytes = options.format === "docx"
    ? await renderDocxExport(compiled)
    : renderMarkdownExport(compiled);

  const filename = `${slugifyFilename(project.name)}-v${nextVersion}.${options.format === "docx" ? "docx" : "md"}`;

  const file = await uploadGeneratedProjectFile(scopeInput, projectId, {
    directory: `exports/${options.format}`,
    kind: "export",
    format: options.format,
    filename,
    mimeType: exportMimeType(options.format),
    bytes,
    version: nextVersion,
    metadata: {
      exportMode: options.mode,
      sectionCount: compiled.sections.length,
      referenceCount: compiled.references.length,
      diagnosticCount: compiled.diagnostics.summary.totalCount,
      citationIssueCount: compiled.diagnostics.summary.citationIssueCount,
      readinessWarningCount: compiled.diagnostics.summary.readinessIssueCount,
      blockingCitationIssueCount: compiled.diagnostics.summary.blockingCitationIssueCount,
      exportedAt: compiled.exportedAt,
    },
  });

  try {
    await createDraftCheckpoint(scopeInput, {
      projectId,
      kind: "export",
      label: `Export ${filename}`,
      draftState: draftSnapshot,
      fileAssetId: file.id,
    });
  } catch (error) {
    try {
      await deleteFileAsset(scopeInput, projectId, file.id);
    } catch (cleanupError) {
      logServerError("draft-export", "failed to rollback file asset after checkpoint error", {
        projectId,
        fileAssetId: file.id,
      }, cleanupError);
    }
    throw error;
  }

  return file;
}
