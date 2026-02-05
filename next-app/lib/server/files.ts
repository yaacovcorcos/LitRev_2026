import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ServiceScope } from "@/lib/server/scope";
import type { FileAsset } from "@/types/files";
import { randomUUID } from "crypto";

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
  scopeInput: Partial<ServiceScope> | null | undefined,
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
  scopeInput: Partial<ServiceScope> | null | undefined,
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
  scopeInput: Partial<ServiceScope> | null | undefined,
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
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  input: FileAssetInput
): Promise<FileAsset> {
  await assertProjectAccess(scopeInput, projectId);
  const created = await prisma.fileAsset.create({
    data: {
      id: input.id ?? undefined,
      projectId,
      studyId: input.studyId ?? undefined,
      kind: input.kind,
      format: input.format ?? undefined,
      filename: input.filename,
      mimeType: input.mimeType,
      size: input.size,
      storagePath: input.storagePath,
      publicUrl: input.publicUrl ?? undefined,
      version: input.version ?? undefined,
      metadata: input.metadata as any,
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

async function uploadToSupabaseStorage(path: string, file: File): Promise<{ storagePath: string; publicUrl: string }> {
  const apiKey = SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !apiKey) {
    throw new Error("Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  }

  const encodedPath = encodeStoragePath(path);
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${encodedPath}`;
  const body = new Uint8Array(await file.arrayBuffer());

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      apikey: apiKey,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body,
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
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  studyId: string,
  file: File
): Promise<FileAsset> {
  await assertProjectAccess(scopeInput, projectId);
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf(".") + 1);
  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/studies/${studyId}/${randomUUID()}-${safeName}`;
  const { storagePath, publicUrl } = await uploadToSupabaseStorage(objectPath, file);

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
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

export async function deleteFileAsset(
  scopeInput: Partial<ServiceScope> | null | undefined,
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
