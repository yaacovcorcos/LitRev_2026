import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ScopeInput } from "@/lib/server/scope";
import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import type { SearchResult } from "@/types/search";
import type { PendingAttachmentExtraction } from "@/types/project-conversation-context";
import { findDuplicates } from "@/lib/server/search/dedup";
import { listStudies } from "@/lib/server/ledger";
import { randomUUID } from "crypto";
import {
  MAX_STUDY_FILE_SIZE,
  ALLOWED_STUDY_FILE_TYPES,
  ALLOWED_STUDY_FILE_EXTENSIONS,
} from "@/lib/file-validation";
import { deleteFileAssetBlob, fetchFileAssetBytes, getClientFileAssetUrls } from "@/lib/server/file-storage";
import type { ChatImageInput, ConversationFileAttachment } from "@/types/ai";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "study-assets";
const PDF_SIGNATURE = "%PDF-";
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_MIN_SIZE = 22;
const ZIP_MAX_COMMENT_LENGTH = 0xffff;
const MAX_CHAT_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_CHAT_ATTACHMENT_REFERENCES = 8;
const MAX_CHAT_IMAGE_ATTACHMENTS = 4;
const MAX_CHAT_IMAGE_TOTAL_BYTES = 20 * 1024 * 1024;
const CHAT_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

type ChatImageMimeType = typeof CHAT_IMAGE_MIME_TYPES[number];

type ValidatedChatAttachmentUpload =
  | ValidatedStudyFileUpload
  | {
      bytes: Uint8Array;
      format: "png" | "jpg" | "webp";
      mimeType: ChatImageMimeType;
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

type ValidatedStudyFileUpload = {
  bytes: Uint8Array;
  format: "pdf" | "docx";
  mimeType: "application/pdf" | typeof DOCX_MIME_TYPE;
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
  const { publicUrl, downloadUrl } = getClientFileAssetUrls(record);
  return {
    id: record.id,
    projectId: record.projectId,
    studyId: record.studyId ?? undefined,
    kind: record.kind,
    format: record.format ?? undefined,
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    publicUrl,
    downloadUrl,
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
): Promise<{ storagePath: string }> {
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

  return {
    storagePath: `${STORAGE_BUCKET}/${path}`,
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
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string,
  file: File
): Promise<FileAsset> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  const validated = await readValidatedStudyFileUpload(file);
  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/studies/${studyId}/${randomUUID()}-${safeName}`;
  const { storagePath } = await uploadBytesToSupabaseStorage(
    objectPath,
    validated.bytes,
    validated.mimeType
  );

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
      workspaceId: scope.workspaceId,
      studyId,
      kind: "source",
      format: validated.format,
      filename: file.name,
      mimeType: validated.mimeType,
      size: file.size,
      storagePath,
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
  const { storagePath } = await uploadBytesToSupabaseStorage(
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
      version: input.version ?? undefined,
      metadata:
        input.metadata === null
          ? Prisma.JsonNull
          : input.metadata === undefined
            ? undefined
            : (input.metadata as Prisma.InputJsonValue),
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
  if (!existing) return;

  // Delete blob first when the row points at a server-owned project blob.
  // Legacy/demo and invalid storage rows are removed from the DB only.
  await deleteFileAssetBlob(existing);
  await prisma.fileAsset.deleteMany({ where: { id: fileId, projectId } });
}

/**
 * Upload a PDF or image attachment for a project conversation.
 * Uploads to Supabase, creates a FileAsset with kind="attachment",
 * and extracts text for AI injection.
 */
export async function uploadChatAttachment(
  scopeInput: ScopeInput,
  projectId: string,
  file: File
): Promise<{ fileAsset: FileAsset; extraction: PendingAttachmentExtraction }> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  const validated = await readValidatedChatAttachmentUpload(file);

  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/conversations/${randomUUID()}-${safeName}`;
  const { storagePath } = await uploadBytesToSupabaseStorage(
    objectPath,
    validated.bytes,
    validated.mimeType
  );

  let extraction: PendingAttachmentExtraction;
  if (validated.mimeType.startsWith("image/")) {
    extraction = {
      status: "ready",
      text: "",
      mediaKind: "image",
    };
  } else {
    const { extractTextFromPdf } = await import("./pdf-extraction");
    try {
      const buffer = Buffer.from(validated.bytes);
      extraction = {
        status: "ready",
        text: await extractTextFromPdf(buffer),
        mediaKind: "document",
      };
    } catch {
      extraction = {
        status: "failed",
        reason: "pdf_parse_failed",
        message: "LitRev uploaded the PDF, but could not read usable text from it. Remove it or attach a different PDF.",
      };
    }
  }

  const created = await prisma.fileAsset.create({
    data: {
      projectId,
      workspaceId: scope.workspaceId,
      kind: "attachment",
      format: validated.format,
      filename: file.name,
      mimeType: validated.mimeType,
      size: file.size,
      storagePath,
      metadata: {
        extractionStatus: extraction.status,
        extractionReason: extraction.status === "failed" ? extraction.reason : undefined,
        mediaKind: extraction.status === "ready" ? extraction.mediaKind : undefined,
        extractedTextLength: extraction.status === "ready" ? extraction.text.length : 0,
      },
    },
  });

  return { fileAsset: toFileAsset(created), extraction };
}

/**
 * Prepare an existing PDF or image FileAsset for chat.
 */
export async function extractTextFromExistingFile(
  scopeInput: ScopeInput,
  projectId: string,
  fileAssetId: string
): Promise<{ fileAsset: FileAsset; extraction: PendingAttachmentExtraction }> {
  await assertProjectAccess(scopeInput, projectId);

  const file = await prisma.fileAsset.findFirst({
    where: { id: fileAssetId, projectId },
  });
  if (!file) {
    throw new Error("File not found.");
  }
  if (isChatImageMimeType(file.mimeType)) {
    return {
      fileAsset: toFileAsset(file),
      extraction: { status: "ready", text: "", mediaKind: "image" },
    };
  }
  if (file.format !== "pdf" && !file.mimeType.includes("pdf")) {
    throw new Error("Only PDF, PNG, JPEG, and WebP files can be attached to conversations.");
  }

  const { extractTextFromPdf } = await import("./pdf-extraction");
  let extraction: PendingAttachmentExtraction;
  try {
    const buffer = await fetchFileAssetBytes(file, { projectId, studyId: file.studyId });
    extraction = {
      status: "ready",
      text: await extractTextFromPdf(buffer),
      mediaKind: "document",
    };
  } catch (error) {
    const reason = error instanceof Error && /supabase|storage|download|fetch/i.test(error.message)
      ? "storage_fetch_failed"
      : "pdf_parse_failed";
    extraction = {
      status: "failed",
      reason,
      message: reason === "storage_fetch_failed"
        ? "LitRev found the PDF, but could not load it for chat. Remove it or try again."
        : "LitRev found the PDF, but could not read usable text from it. Remove it or choose a different PDF.",
    };
  }

  return { fileAsset: toFileAsset(file), extraction };
}

/**
 * Hydrate access-checked image bytes for provider requests. Client requests
 * supply FileAsset identities only; stored MIME metadata and canonical blob
 * ownership remain authoritative here.
 */
export async function loadChatImageInputs(
  scopeInput: ScopeInput,
  projectId: string,
  attachments: readonly ConversationFileAttachment[],
): Promise<ChatImageInput[]> {
  await assertProjectAccess(scopeInput, projectId);
  const requestedIds = [...new Set(attachments.map((attachment) => attachment.fileAssetId))];
  if (requestedIds.length === 0) return [];
  if (requestedIds.length > MAX_CHAT_ATTACHMENT_REFERENCES) {
    throw new Error(`A chat message can reference at most ${MAX_CHAT_ATTACHMENT_REFERENCES} files.`);
  }

  const files = await prisma.fileAsset.findMany({
    where: { id: { in: requestedIds }, projectId },
  });
  const filesById = new Map(files.map((file) => [file.id, file]));
  const unavailableFileId = requestedIds.find((fileId) => !filesById.has(fileId));
  if (unavailableFileId) {
    throw new Error("One or more attached files are unavailable or outside this project.");
  }
  const imageFiles = requestedIds
    .map((fileId) => filesById.get(fileId))
    .filter((file): file is (typeof files)[number] & { mimeType: ChatImageMimeType } => (
      Boolean(file && isChatImageMimeType(file.mimeType))
    ));
  if (imageFiles.length > MAX_CHAT_IMAGE_ATTACHMENTS) {
    throw new Error(`A chat message can include at most ${MAX_CHAT_IMAGE_ATTACHMENTS} images.`);
  }
  const totalImageBytes = imageFiles.reduce((total, file) => total + Math.max(0, file.size), 0);
  if (totalImageBytes > MAX_CHAT_IMAGE_TOTAL_BYTES) {
    throw new Error("Chat images may use at most 20 MB in total.");
  }
  const imageInputs: ChatImageInput[] = [];

  for (const file of imageFiles) {
    if (file.size > MAX_CHAT_IMAGE_SIZE) {
      throw new Error(`Image ${file.filename} is too large. Maximum size is 10 MB.`);
    }
    const bytes = await fetchFileAssetBytes(file, { projectId, studyId: file.studyId });
    if (!hasImageSignature(bytes, file.mimeType)) {
      throw new Error(`Image ${file.filename} failed file validation.`);
    }
    imageInputs.push({
      fileAssetId: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      dataUrl: `data:${file.mimeType};base64,${bytes.toString("base64")}`,
    });
  }

  return imageInputs;
}

async function readValidatedChatAttachmentUpload(file: File): Promise<ValidatedChatAttachmentUpload> {
  const ext = getFileExtension(file.name);
  if (ext === ".pdf") {
    const validated = await readValidatedStudyFileUpload(file);
    if (validated.format !== "pdf") {
      throw new Error("Only PDF, PNG, JPEG, and WebP files can be attached to conversations.");
    }
    return validated;
  }

  if (file.size > MAX_CHAT_IMAGE_SIZE) {
    throw new Error("Image too large. Maximum size is 10 MB.");
  }
  const mimeType = normalizeChatImageMimeType(file.type, ext);
  if (!mimeType) {
    throw new Error("Only PDF, PNG, JPEG, and WebP files can be attached to conversations.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(bytes, mimeType)) {
    throw new Error("The selected image does not match its declared file type.");
  }
  return {
    bytes,
    format: mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg",
    mimeType,
  };
}

function normalizeChatImageMimeType(mimeType: string, extension: string): ChatImageMimeType | null {
  if (mimeType === "image/png" || extension === ".png") return "image/png";
  if (mimeType === "image/jpeg" || extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (mimeType === "image/webp" || extension === ".webp") return "image/webp";
  return null;
}

function isChatImageMimeType(mimeType: string): mimeType is ChatImageMimeType {
  return (CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

function hasImageSignature(bytes: Uint8Array, mimeType: ChatImageMimeType): boolean {
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.byteLength >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === "image/jpeg") {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return bytes.byteLength >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function readValidatedStudyFileUpload(file: File): Promise<ValidatedStudyFileUpload> {
  if (file.size > MAX_STUDY_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is 100 MB.`);
  }

  const ext = getFileExtension(file.name);
  if (!ALLOWED_STUDY_FILE_EXTENSIONS.includes(ext) && !ALLOWED_STUDY_FILE_TYPES.includes(file.type)) {
    throw new Error("Only PDF and DOCX files are allowed.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (ext === ".pdf") {
    if (!hasPdfSignature(bytes)) {
      throw new Error("Only valid PDF and DOCX files are allowed.");
    }
    return { bytes, format: "pdf", mimeType: "application/pdf" };
  }

  if (ext === ".docx") {
    if (!hasDocxSignature(bytes)) {
      throw new Error("Only valid PDF and DOCX files are allowed.");
    }
    return { bytes, format: "docx", mimeType: DOCX_MIME_TYPE };
  }

  throw new Error("Only PDF and DOCX files are allowed.");
}

function getFileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex === -1 ? "" : filename.slice(dotIndex).toLowerCase();
}

function hasPdfSignature(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder("ascii");
  const header = decoder.decode(bytes.slice(0, Math.min(bytes.byteLength, 1024)));
  const trimmedHeader = header.replace(/^\uFEFF/, "").trimStart();
  return trimmedHeader.startsWith(PDF_SIGNATURE);
}

function hasDocxSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4 || readUInt32LE(bytes, 0) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE) {
    return false;
  }

  // DOCX is an OOXML ZIP package; validate entry names from the central
  // directory instead of decoding the entire binary file as text.
  const entries = readZipCentralDirectoryEntryNames(bytes);
  if (!entries) return false;
  const entryNames = new Set(entries);
  return entryNames.has("[Content_Types].xml") && entryNames.has("word/document.xml");
}

function readUInt16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function findZipEndOfCentralDirectoryOffset(bytes: Uint8Array): number | null {
  const minOffset = Math.max(0, bytes.byteLength - ZIP_END_OF_CENTRAL_DIRECTORY_MIN_SIZE - ZIP_MAX_COMMENT_LENGTH);
  for (let offset = bytes.byteLength - ZIP_END_OF_CENTRAL_DIRECTORY_MIN_SIZE; offset >= minOffset; offset--) {
    if (readUInt32LE(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  return null;
}

function readZipCentralDirectoryEntryNames(bytes: Uint8Array): string[] | null {
  const eocdOffset = findZipEndOfCentralDirectoryOffset(bytes);
  if (eocdOffset === null || eocdOffset + ZIP_END_OF_CENTRAL_DIRECTORY_MIN_SIZE > bytes.byteLength) {
    return null;
  }

  const entryCount = readUInt16LE(bytes, eocdOffset + 10);
  const centralDirectorySize = readUInt32LE(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readUInt32LE(bytes, eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    centralDirectoryOffset >= bytes.byteLength
    || centralDirectoryEnd > bytes.byteLength
    || centralDirectoryEnd > eocdOffset
  ) {
    return null;
  }

  const decoder = new TextDecoder("utf-8");
  const names: string[] = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (
      offset + 46 > centralDirectoryEnd
      || readUInt32LE(bytes, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE
    ) {
      return null;
    }

    const filenameLength = readUInt16LE(bytes, offset + 28);
    const extraLength = readUInt16LE(bytes, offset + 30);
    const commentLength = readUInt16LE(bytes, offset + 32);
    const nameStart = offset + 46;
    const nextOffset = nameStart + filenameLength + extraLength + commentLength;
    if (nameStart + filenameLength > centralDirectoryEnd || nextOffset > centralDirectoryEnd) {
      return null;
    }

    names.push(decoder.decode(bytes.slice(nameStart, nameStart + filenameLength)));
    offset = nextOffset;
  }

  return names;
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
  const validated = await readValidatedStudyFileUpload(file);

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
  const safeName = sanitizeFilename(file.name);
  const objectPath = `projects/${projectId}/studies/${studyId}/${randomUUID()}-${safeName}`;

  // 1. Upload blob first (can't be inside a DB transaction)
  const { storagePath } = await uploadBytesToSupabaseStorage(
    objectPath,
    validated.bytes,
    validated.mimeType
  );

  // 2. Create Study + FileAsset in a single DB transaction
  try {
    const [studyRecord, fileRecord] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const studyRecord = matchedDuplicate
        ? await tx.study.findFirst({
          where: { id: studyId, projectId, deletedAt: null },
        })
        : await tx.study.create({
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

      if (!studyRecord) {
        throw new Error("Duplicate matched study not found.");
      }

      const fileRecord = await tx.fileAsset.create({
        data: {
          projectId,
          workspaceId: scope.workspaceId,
          studyId,
          kind: "source",
          format: validated.format,
          filename: file.name,
          mimeType: validated.mimeType,
          size: file.size,
          storagePath,
        },
      });
      return [studyRecord, fileRecord] as const;
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
