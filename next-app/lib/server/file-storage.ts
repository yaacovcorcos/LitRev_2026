import "server-only";

export type FileAssetStorageRecord = {
  id?: string;
  projectId: string;
  studyId?: string | null;
  kind: string;
  filename: string;
  mimeType: string;
  storagePath: string;
  publicUrl?: string | null;
};

type FileAssetStorageExpectation = {
  projectId?: string;
  studyId?: string | null;
};

type ParsedStoragePath = {
  bucket: string;
  objectPath: string;
  objectSegments: string[];
};

type ResolvedFileAssetAccess =
  | {
      mode: "canonical";
      bucket: string;
      objectPath: string;
      publicUrl?: string;
      downloadUrl?: string;
      canDeleteBlob: true;
    }
  | {
      mode: "external-demo";
      publicUrl?: string;
      downloadUrl?: string;
      canDeleteBlob: false;
    };

function getSupabaseUrl(): string | undefined {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
}

function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function getStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "study-assets";
}

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function parseStoragePath(storagePath: string): ParsedStoragePath | null {
  const trimmed = storagePath.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return null;

  const segments = trimmed.split("/");
  if (segments.length < 2) return null;
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return null;
  }

  const [bucket, ...objectSegments] = segments;
  return {
    bucket,
    objectPath: objectSegments.join("/"),
    objectSegments,
  };
}

function derivePublicStorageUrl(bucket: string, objectPath: string): string | undefined {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) return undefined;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeStoragePath(objectPath)}`;
}

function normalizePublicUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function canUsePublicUrlAsDownload(url: string | undefined, record: FileAssetStorageRecord): boolean {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const lowerFilename = record.filename.toLowerCase();
    const extension = lowerFilename.includes(".")
      ? lowerFilename.slice(lowerFilename.lastIndexOf("."))
      : "";

    if (extension && pathname.endsWith(extension)) {
      return true;
    }

    return /\.(pdf|docx|md|txt)$/i.test(pathname);
  } catch {
    return false;
  }
}

function isCanonicalStoragePathForRecord(
  record: FileAssetStorageRecord,
  parsed: ParsedStoragePath,
): boolean {
  if (parsed.bucket !== getStorageBucket()) return false;

  const [root, projectId, branch, branchId] = parsed.objectSegments;
  if (root !== "projects" || projectId !== record.projectId) return false;

  if (record.kind === "source") {
    return (
      branch === "studies" &&
      typeof record.studyId === "string" &&
      branchId === record.studyId &&
      parsed.objectSegments.length === 5
    );
  }

  if (record.kind === "attachment") {
    return branch === "conversations" && parsed.objectSegments.length === 4;
  }

  if (record.kind === "export") {
    return branch === "exports" && parsed.objectSegments.length >= 5;
  }

  return false;
}

function isExplicitExternalDemoPath(parsed: ParsedStoragePath): boolean {
  return parsed.bucket === "external" && parsed.objectSegments[0] === "demo" && parsed.objectSegments.length === 2;
}

function maybeResolveFileAssetAccess(
  record: FileAssetStorageRecord,
  expectation?: FileAssetStorageExpectation,
): ResolvedFileAssetAccess | null {
  if (expectation?.projectId && expectation.projectId !== record.projectId) {
    return null;
  }
  if (typeof expectation?.studyId !== "undefined" && expectation.studyId !== (record.studyId ?? null)) {
    return null;
  }

  const parsed = parseStoragePath(record.storagePath);
  if (!parsed) return null;

  if (isCanonicalStoragePathForRecord(record, parsed)) {
    const publicUrl = derivePublicStorageUrl(parsed.bucket, parsed.objectPath);
    return {
      mode: "canonical",
      bucket: parsed.bucket,
      objectPath: parsed.objectPath,
      publicUrl,
      downloadUrl: publicUrl,
      canDeleteBlob: true,
    };
  }

  if (isExplicitExternalDemoPath(parsed)) {
    const publicUrl = normalizePublicUrl(record.publicUrl);
    return {
      mode: "external-demo",
      publicUrl,
      downloadUrl: canUsePublicUrlAsDownload(publicUrl, record) ? publicUrl : undefined,
      canDeleteBlob: false,
    };
  }

  return null;
}

function requireValidatedFileAssetAccess(
  record: FileAssetStorageRecord,
  expectation?: FileAssetStorageExpectation,
): ResolvedFileAssetAccess {
  const access = maybeResolveFileAssetAccess(record, expectation);
  if (!access) {
    throw new Error("Invalid file storage location.");
  }
  return access;
}

export function getClientFileAssetUrls(record: FileAssetStorageRecord): {
  publicUrl?: string;
  downloadUrl?: string;
} {
  const access = maybeResolveFileAssetAccess(record);
  if (!access) {
    return {};
  }

  return {
    publicUrl: access.publicUrl,
    downloadUrl: access.downloadUrl,
  };
}

export async function fetchFileAssetBytes(
  record: FileAssetStorageRecord,
  expectation?: FileAssetStorageExpectation,
): Promise<Buffer> {
  const access = requireValidatedFileAssetAccess(record, expectation);

  let response: Response;
  if (access.mode === "canonical") {
    const supabaseUrl = getSupabaseUrl();
    const serviceRoleKey = getSupabaseServiceRoleKey();
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
    }

    const url = `${supabaseUrl}/storage/v1/object/${access.bucket}/${encodeStoragePath(access.objectPath)}`;
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
  } else {
    if (!access.publicUrl) {
      throw new Error("Demo file is missing a readable public URL.");
    }

    response = await fetch(access.publicUrl);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("PDF file not found in storage");
    }
    throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deleteFileAssetBlob(record: FileAssetStorageRecord): Promise<boolean> {
  const access = maybeResolveFileAssetAccess(record);
  if (!access || !access.canDeleteBlob) {
    return false;
  }

  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
  }

  const deleteUrl = `${supabaseUrl}/storage/v1/object/${access.bucket}/${encodeStoragePath(access.objectPath)}`;
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Storage delete failed (${response.status}): ${text}`);
  }

  return true;
}
