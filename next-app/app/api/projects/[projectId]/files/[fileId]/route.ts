import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { requireApiSession } from "@/lib/server/auth/session";
import { fetchFileAssetResponse } from "@/lib/server/file-storage";
import { logServerError } from "@/lib/server/logging";
import { projectIdSchema, resourceIdSchema } from "@/lib/schemas/ids";

function sanitizeDownloadFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "download";
  return trimmed
    .replace(/[\\\"]/g, "_")
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\x20-\x7E]/g, "_");
}

function buildInlineDisposition(filename: string): string {
  const fallback = sanitizeDownloadFilename(filename);
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string; fileId: string }> },
) {
  const authResult = await requireApiSession(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const params = await context.params;
  const validatedProjectId = projectIdSchema.safeParse(params.projectId);
  const validatedFileId = resourceIdSchema.safeParse(params.fileId);
  if (!validatedProjectId.success || !validatedFileId.success) {
    return NextResponse.json({ error: "Invalid file request." }, { status: 400 });
  }

  const projectId = validatedProjectId.data;
  const fileId = validatedFileId.data;

  try {
    await assertProjectAccess(
      { ownerId: authResult.context.userId, workspaceId: authResult.context.workspaceId },
      projectId,
    );
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const file = await prisma.fileAsset.findFirst({
    where: { id: fileId, projectId },
    select: {
      id: true,
      projectId: true,
      studyId: true,
      kind: true,
      filename: true,
      mimeType: true,
      storagePath: true,
      publicUrl: true,
    },
  });

  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const upstream = await fetchFileAssetResponse(file, {
      projectId,
      studyId: file.studyId ?? null,
    });

    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") || file.mimeType || "application/octet-stream");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }
    headers.set("Content-Disposition", buildInlineDisposition(file.filename));
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");

    return new NextResponse(upstream.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to download file";

    if (
      message === "PDF file not found in storage" ||
      message === "Invalid file storage location." ||
      message === "Demo file is missing a readable public URL."
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (message.includes("Missing Supabase configuration")) {
      logServerError("project-file-download", "missing storage configuration", {
        projectId,
        fileId,
      }, error);
      return NextResponse.json({ error: "File download is temporarily unavailable." }, { status: 500 });
    }

    logServerError("project-file-download", "file download failed", {
      projectId,
      fileId,
    }, error);
    return NextResponse.json({ error: "File download failed." }, { status: 502 });
  }
}
