import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ScopeInput } from "@/lib/server/scope";
import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import type { SearchResult } from "@/types/search";
import { findDuplicates } from "@/lib/server/search/dedup";
import { listStudies } from "@/lib/server/ledger";
import { randomUUID } from "crypto";
import {
  MAX_STUDY_FILE_SIZE,
  ALLOWED_STUDY_FILE_TYPES,
  ALLOWED_STUDY_FILE_EXTENSIONS,
} from "@/lib/fileValidation";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "study-assets";

export type FileAssetInput = {
  id?: string;
  projectId?: string;
  studyId?: string;
  kind: string;
  format?: string;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  publicUrl?: string | null;
  version?: number;
  metadata?: Record<string, unknown> | null;
};

export type GeneratedProjectFileInput = {
  directory: string;
  kind: string;
  format?: string;
  filename: string;
  mimeType: string;
  bytes: Uint8Array | Buffer;
  version?: number;
  metadata?: Record<string, unknown> | null;
};

function toJsonMetadataInput(
  metadata: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined {
  return metadata == null ? undefined : (metadata as Prisma.InputJsonValue);
}

function normalizeStoragePathSegments(storagePath: string): string[] {
  return storagePath
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((segment) => segment.length > 0);
}

function isProjectScopedStoragePath(storagePath: string, projectId: string): boolean {
  const segments = normalizeStoragePathSegments(storagePath);
  if (segments.length < 3) return false;

  const offset = segments[0] === STORAGE_BUCKET ? 1 : 0;
  return (
    segments[offset] === "projects"
    && segments[offset + 1] === projectId
    && typeof segments[offset + 2] === "string"
    && segments[offset + 2].length > 0
  );
}

function toFileAsset(record: {
  id: string;
  projectId: string;
  studyId: string | null;
  kind: string;
  format: string | null;
  filename: string;
  mimeType: string;
  size: number;
  storagePath: string;
  publicUrl: string | null;
  version: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): FileAsset {
  return {
    id: record.id,
    projectId: record.projectId,
    studyId: record.studyId ?? undefined,
    kind: record.kind,
    format: record.format ?? undefined,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    storagePath: record.storagePath,
    publicUrl: record.publicUrl ?? undefined,
    version: record.version,
    metadata: (record.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listProjectFiles(
  scopeInput: ScopeInput,
  projectId: string
): Promise<FileAsset[]> {
  await assertProjectAccess(scopeInput, projectId);
  const files = await prisma.fileAsset.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
  return files.map(toFileAsset);
}

export async function listStudyFiles(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string
): Promise<FileAsset[]> {
  await assertProjectAccess(scopeInput, projectId);
  const files = await prisma.fileAsset.findMany({
    where: { projectId, studyId },
    orderBy: { createdAt: "desc" },
  });
  return files.map(toFileAsset);
}

export async function getFileAssetById(
  scopeInput: ScopeInput,
  projectId: string,
  fileId: string
): Promise<FileAsset | null> {
  await assertProjectAccess(scopeInput, projectId);
  const file = await prisma.fileAsset.findFirst({
    where: { id: fileId, projectId },
  });
  return file ? toFileAsset(file) : null;
}

export async function createFileAsset(
  scopeInput: ScopeInput,
  projectId: string,
  input: FileAssetInput
): Promise<FileAsset> {
  const scope = await assertProjectAccess(scopeInput, projectId);

  // Accept only canonical project-scoped object paths, optionally prefixed
  // by the storage bucket name, to prevent cross-tenant path injection.
  if (!isProjectScopedStoragePath(input.storagePath, projectId)) {
    throw new Error("Storage path must belong to the specified project.");
  }

  const created = await prisma.fileAsset.create({
    data: {
      id: input.id ?? undefined,
      projectId,
      workspaceId: scope.workspaceId,
      studyId: input.studyId ?? undefined,
      kind: input.kind,
      format: input.format ?? undefined,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      storagePath: input.storagePath,
      publicUrl: input.publicUrl ?? undefined,
      version: input.version ?? undefined,
      metadata: toJsonMetadataInput(input.metadata),
    },
  });
  return toFileAsset(created);
}

function sanitizeFilename(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "file";
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function uploadBytesToSupabaseStorage(
  path: string,
  bytes: Uint8Array | Buffer,
  mimeType: string
): Promise<{ storagePath: string; publicUrl: string }> {
  const apiKey = SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !apiKey) {
    throw new Error("Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  }

  const encodedPath = encodeStoragePath(path);
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`;
  const body = Uint8Array.from(bytes);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
      "Content-Type": mimeType || "application/octet-stream",
      "x-upsert": "false",
    },
    body: new Blob([body], { type: mimeType || "application/octet-stream" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed (${response.status}): ${text}`);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodedPath}`;
  return {
    storagePath: `${STORAGE_BUCKET}/${path}`,
    publicUrl,
  };
}

async function uploadToSupabaseStorage(path: string, file: File): Promise<{ storagePath: string; publicUrl: string }> {
  const body = new Uint8Array(await file.arrayBuffer());
  return uploadBytesToSupabaseStorage(path, body, file.type || "application/octet-stream");
}

function splitStoragePath(storagePath: string): { bucket: string; objectPath: string } {
  const trimmed = storagePath.trim().replace(/^\/+/, "");
  const idx = trimmed.indexOf("/");
  if (idx === -1) {
    return { bucket: STORAGE_BUCKET, objectPath: trimmed };
  }
  return { bucket: trimmed.slice(0, idx), objectPath: trimmed.slice(idx + 1) };
}

async function deleteFromSupabaseStorage(storagePath: string): Promise<void> {
  const apiKey = SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !apiKey) {
    throw new Error("Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  }

  const { bucket, objectPath } = splitStoragePath(storagePath);
  const encodedPath = encodeStoragePath(objectPath);
  const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodedPath}`;

  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
    },
  });

  // Treat already-missing objects as success so DB cleanup can proceed.
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Storage delete failed (${response.status}): ${text}`);
  }
}

export async function uploadStudyFile(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string,
  file: File
): Promise<FileAsset> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf(".") + 1);
  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/studies/${studyId}/${randomUUID()}-${safeName}`;
  const { storagePath, publicUrl } = await uploadToSupabaseStorage(objectPath, file);

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
      workspaceId: scope.workspaceId,
      studyId,
      kind: "source",
      format: ext || undefined,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      storagePath,
      publicUrl,
    },
  });

  return toFileAsset(created);
}

export async function uploadGeneratedProjectFile(
  scopeInput: ScopeInput,
  projectId: string,
  input: GeneratedProjectFileInput
): Promise<FileAsset> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  const safeName = sanitizeFilename(input.filename);
  const safeDirectory = input.directory.trim().replace(/^\/+|\/+$/g, "") || "generated";
  const objectPath = `projects/${projectId}/${safeDirectory}/${randomUUID()}-${safeName}`;
  const { storagePath, publicUrl } = await uploadBytesToSupabaseStorage(
    objectPath,
    input.bytes,
    input.mimeType || "application/octet-stream"
  );

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
      workspaceId: scope.workspaceId,
      kind: input.kind,
      format: input.format ?? undefined,
      filename: input.filename,
      mimeType: input.mimeType || "application/octet-stream",
      size: input.bytes.byteLength,
      storagePath,
      publicUrl,
      version: input.version ?? undefined,
      metadata: toJsonMetadataInput(input.metadata),
    },
  });

  return toFileAsset(created);
}

export async function deleteFileAsset(
  scopeInput: ScopeInput,
  projectId: string,
  fileId: string
): Promise<void> {
  await assertProjectAccess(scopeInput, projectId);

  const existing = await prisma.fileAsset.findFirst({
    where: { id: fileId, projectId },
    select: { storagePath: true },
  });
  if (!existing) return;

  // Delete blob first; if this fails, keep the DB record so the user can retry.
  await deleteFromSupabaseStorage(existing.storagePath);
  await prisma.fileAsset.deleteMany({ where: { id: fileId, projectId } });
}

/**
 * Upload a PDF attachment for a copilot conversation.
 * Uploads to Supabase, creates a FileAsset with kind="attachment",
 * and extracts text for AI injection.
 */
export async function uploadChatAttachment(
  scopeInput: ScopeInput,
  projectId: string,
  file: File
): Promise<{ fileAsset: FileAsset; extractedText: string }> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  validateFileServer(file);

  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf(".") + 1);
  if (ext !== "pdf") {
    throw new Error("Only PDF files can be attached to conversations.");
  }

  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/conversations/${randomUUID()}-${safeName}`;
  const { storagePath, publicUrl } = await uploadToSupabaseStorage(objectPath, file);

  // Extract text from the uploaded PDF
  const { extractTextFromPdf } = await import("./pdf-extraction");
  const buffer = Buffer.from(await file.arrayBuffer());
  let extractedText: string;
  try {
    extractedText = await extractTextFromPdf(buffer);
  } catch {
    extractedText = "[PDF text extraction failed]";
  }

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
      workspaceId: scope.workspaceId,
      kind: "attachment",
      format: ext,
      filename: file.name,
      mimeType: file.type || "application/pdf",
      size: file.size,
      storagePath,
      publicUrl,
      metadata: { extractedTextLength: extractedText.length },
    },
  });

  return { fileAsset: toFileAsset(created), extractedText };
}

/**
 * Extract text from an existing FileAsset's PDF (for referencing study PDFs in chat).
 */
export async function extractTextFromExistingFile(
  scopeInput: ScopeInput,
  projectId: string,
  fileAssetId: string
): Promise<{ fileAsset: FileAsset; extractedText: string }> {
  await assertProjectAccess(scopeInput, projectId);

  const file = await prisma.fileAsset.findFirst({
    where: { id: fileAssetId, projectId },
  });
  if (!file) {
    throw new Error("File not found.");
  }
  if (file.format !== "pdf" && !file.mimeType.includes("pdf")) {
    throw new Error("Only PDF files can be attached to conversations.");
  }

  const { fetchPdfFromStorage, extractTextFromPdf } = await import("./pdf-extraction");
  const buffer = await fetchPdfFromStorage(file.storagePath);
  const extractedText = await extractTextFromPdf(buffer);

  return { fileAsset: toFileAsset(file), extractedText };
}

function validateFileServer(file: File): void {
  if (file.size > MAX_STUDY_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is 100 MB.`);
  }
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ALLOWED_STUDY_FILE_EXTENSIONS.includes(ext) && !ALLOWED_STUDY_FILE_TYPES.includes(file.type)) {
    throw new Error("Only PDF and DOCX files are allowed.");
  }
}

/**
 * Atomic PDF import: creates a Study + uploads the file + creates the FileAsset
 * in a single transaction. If the DB transaction fails, the uploaded blob is
 * cleaned up (best-effort).
 */
export async function importStudyWithPdf(
  scopeInput: ScopeInput,
  projectId: string,
  file: File
): Promise<{ study: Study; fileAsset: FileAsset }> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  validateFileServer(file);

  const inferredTitle = file.name.replace(/\.[^/.]+$/, "").trim() || "Untitled Study";
  const inferredYear = new Date().getFullYear();
  const dedupeProbe: SearchResult = {
    title: inferredTitle,
    authors: "Unknown",
    year: inferredYear,
    source: "crossref",
  };
  const existingStudies = await listStudies(scope, projectId);
  const { duplicates } = findDuplicates(existingStudies, [dedupeProbe]);
  const matchedDuplicate = duplicates[0];

  const studyId = matchedDuplicate?.existingStudyId ?? randomUUID();
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf(".") + 1);
  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/studies/${studyId}/${randomUUID()}-${safeName}`;

  // 1. Upload blob first (can't be inside a DB transaction)
  const { storagePath, publicUrl } = await uploadToSupabaseStorage(objectPath, file);

  // 2. Create Study + FileAsset in a single DB transaction
  try {
    const [studyRecord, fileRecord] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      let s;
      if (matchedDuplicate) {
        s = await tx.study.findFirst({
          where: { id: studyId, projectId, deletedAt: null },
        });
        if (!s) {
          throw new Error("Duplicate matched study not found.");
        }
      } else {
        s = await tx.study.create({
          data: {
            id: studyId,
            projectId,
            workspaceId: scope.workspaceId,
            title: inferredTitle,
            authors: "Unknown",
            year: inferredYear,
            status: "pending",
            quality: "-",
            details: { source: "pdf-import" },
          },
        });
      }
      const f = await tx.fileAsset.create({
        data: {
          projectId,
          workspaceId: scope.workspaceId,
          studyId,
          kind: "source",
          format: ext || undefined,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          storagePath,
          publicUrl,
        },
      });
      return [s, f] as const;
    });

    const study: Study = {
      id: studyRecord.id,
      title: studyRecord.title,
      authors: studyRecord.authors,
      year: studyRecord.year,
      status: studyRecord.status as Study["status"],
      quality: studyRecord.quality as Study["quality"],
      details: (studyRecord.details as Study["details"]) ?? undefined,
    };

    return { study, fileAsset: toFileAsset(fileRecord) };
  } catch (err) {
    // Best-effort cleanup of the uploaded blob
    try {
      await deleteFromSupabaseStorage(storagePath);
    } catch {
      // Ignore cleanup failure — blob is orphaned but DB is clean
    }
    throw err;
  }
}
