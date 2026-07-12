import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SUPABASE_URL = "https://supabase.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

const mocks = vi.hoisted(() => ({
  assertProjectAccess: vi.fn(),
  prisma: {
    fileAsset: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/access", () => ({
  assertProjectAccess: mocks.assertProjectAccess,
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: mocks.prisma,
}));

vi.mock("@/lib/server/ledger", () => ({
  listStudies: vi.fn(),
}));

const { loadChatImageInputs, uploadChatAttachment, uploadStudyFile } = await import("@/lib/server/files");

const PDF_BYTES = "%PDF-1.7\n1 0 obj\n<<>>\nendobj\n";

function bytesFromAscii(value: string): Uint8Array {
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}

function uint16LE(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32LE(value: number): number[] {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function zipLocalHeader(name: string, data: Uint8Array): Uint8Array {
  const nameBytes = bytesFromAscii(name);
  return concatBytes([
    Uint8Array.from([
      ...uint32LE(0x04034b50),
      ...uint16LE(20),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint32LE(0),
      ...uint32LE(data.byteLength),
      ...uint32LE(data.byteLength),
      ...uint16LE(nameBytes.byteLength),
      ...uint16LE(0),
    ]),
    nameBytes,
    data,
  ]);
}

function zipCentralDirectoryHeader(name: string, data: Uint8Array, localOffset: number): Uint8Array {
  const nameBytes = bytesFromAscii(name);
  return concatBytes([
    Uint8Array.from([
      ...uint32LE(0x02014b50),
      ...uint16LE(20),
      ...uint16LE(20),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint32LE(0),
      ...uint32LE(data.byteLength),
      ...uint32LE(data.byteLength),
      ...uint16LE(nameBytes.byteLength),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint16LE(0),
      ...uint32LE(0),
      ...uint32LE(localOffset),
    ]),
    nameBytes,
  ]);
}

function zipEndOfCentralDirectory(entryCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  return Uint8Array.from([
    ...uint32LE(0x06054b50),
    ...uint16LE(0),
    ...uint16LE(0),
    ...uint16LE(entryCount),
    ...uint16LE(entryCount),
    ...uint32LE(centralDirectorySize),
    ...uint32LE(centralDirectoryOffset),
    ...uint16LE(0),
  ]);
}

function makeZip(entries: Array<{ name: string; data?: string }>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const data = bytesFromAscii(entry.data ?? "");
    const local = zipLocalHeader(entry.name, data);
    localParts.push(local);
    centralParts.push(zipCentralDirectoryHeader(entry.name, data, localOffset));
    localOffset += local.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  return concatBytes([
    ...localParts,
    centralDirectory,
    zipEndOfCentralDirectory(entries.length, centralDirectory.byteLength, localOffset),
  ]);
}

const DOCX_BYTES = makeZip([
  { name: "[Content_Types].xml" },
  { name: "word/document.xml" },
]);
const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d,
]);

function createdFileAsset(overrides: Partial<{
  filename: string;
  format: string;
  mimeType: string;
  size: number;
  storagePath: string;
}> = {}) {
  return {
    id: "file-1",
    projectId: "proj-1",
    workspaceId: "workspace-1",
    studyId: "study-1",
    kind: "source",
    format: overrides.format ?? "pdf",
    filename: overrides.filename ?? "paper.pdf",
    mimeType: overrides.mimeType ?? "application/pdf",
    size: overrides.size ?? PDF_BYTES.length,
    storagePath: overrides.storagePath ?? "study-assets/projects/proj-1/studies/study-1/paper.pdf",
    publicUrl: null,
    version: 1,
    metadata: null,
    createdAt: new Date("2026-05-05T00:00:00.000Z"),
    updatedAt: new Date("2026-05-05T00:00:00.000Z"),
  };
}

describe("uploadStudyFile server validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertProjectAccess.mockResolvedValue({
      ownerId: "user-1",
      workspaceId: "workspace-1",
    });
    mocks.prisma.fileAsset.create.mockImplementation(({ data }) =>
      Promise.resolve(createdFileAsset({
        filename: data.filename,
        format: data.format,
        mimeType: data.mimeType,
        size: data.size,
        storagePath: data.storagePath,
      })),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
  });

  it("stores valid PDFs with a canonical MIME type even when the caller spoofs the browser MIME", async () => {
    const uploaded = await uploadStudyFile(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      "study-1",
      new File([PDF_BYTES], "paper.pdf", { type: "text/html" }),
    );

    expect(uploaded.format).toBe("pdf");
    expect(uploaded.mimeType).toBe("application/pdf");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/storage/v1/object/study-assets/projects/proj-1/studies/study-1/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/pdf",
        }),
      }),
    );
    expect(mocks.prisma.fileAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          format: "pdf",
          mimeType: "application/pdf",
        }),
      }),
    );
  });

  it("stores valid DOCX files with a canonical MIME type", async () => {
    const uploaded = await uploadStudyFile(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      "study-1",
      new File([blobPart(DOCX_BYTES)], "paper.docx", { type: "application/octet-stream" }),
    );

    expect(uploaded.format).toBe("docx");
    expect(uploaded.mimeType).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      }),
    );
  });

  it.each([
    ["HTML disguised as PDF", new File(["<script>alert(1)</script>"], "paper.pdf", { type: "text/html" })],
    ["SVG disguised as PDF", new File(["<svg><script>alert(1)</script></svg>"], "paper.pdf", { type: "image/svg+xml" })],
    ["PDF bytes with an unsafe extension", new File([PDF_BYTES], "paper.html", { type: "application/pdf" })],
    ["ZIP bytes without DOCX package markers", new File(["PK\u0003\u0004not-a-docx"], "paper.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })],
    ["ZIP content spoofing DOCX markers outside central directory", new File([
      blobPart(makeZip([{ name: "payload.txt", data: "[Content_Types].xml word/document.xml" }])),
    ], "paper.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })],
  ])("rejects %s before storage", async (_label, file) => {
    await expect(uploadStudyFile(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      "study-1",
      file,
    )).rejects.toThrow(/Only (valid )?PDF and DOCX files are allowed/);

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.fileAsset.create).not.toHaveBeenCalled();
  });

  it("accepts a signature-validated PNG chat attachment with canonical MIME metadata", async () => {
    const uploaded = await uploadChatAttachment(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      new File([blobPart(PNG_BYTES)], "figure.png", { type: "application/octet-stream" }),
    );

    expect(uploaded.extraction).toEqual({ status: "ready", text: "", mediaKind: "image" });
    expect(mocks.prisma.fileAsset.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        format: "png",
        mimeType: "image/png",
        kind: "attachment",
      }),
    }));
  });

  it("rejects image extensions whose bytes do not match", async () => {
    await expect(uploadChatAttachment(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      new File(["<svg><script>alert(1)</script></svg>"], "figure.png", { type: "image/png" }),
    )).rejects.toThrow("does not match its declared file type");

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.fileAsset.create).not.toHaveBeenCalled();
  });

  it("rejects DOCX chat attachments before reading file bytes", async () => {
    const file = new File([blobPart(DOCX_BYTES)], "paper.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const arrayBufferSpy = vi.spyOn(file, "arrayBuffer");

    await expect(uploadChatAttachment(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      file,
    )).rejects.toThrow("Only PDF, PNG, JPEG, and WebP files can be attached to conversations.");

    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.prisma.fileAsset.create).not.toHaveBeenCalled();
  });

  it("deduplicates repeated image references before loading provider bytes", async () => {
    mocks.prisma.fileAsset.findMany.mockResolvedValue([
      createdFileAsset({
        filename: "figure.png",
        format: "png",
        mimeType: "image/png",
        size: PNG_BYTES.byteLength,
      }),
    ]);
    vi.mocked(fetch).mockResolvedValue(new Response(blobPart(PNG_BYTES), { status: 200 }));

    const attachment = {
      fileAssetId: "file-1",
      filename: "figure.png",
      mimeType: "image/png",
      size: PNG_BYTES.byteLength,
      isExisting: true,
    };
    const images = await loadChatImageInputs(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      [attachment, attachment, attachment],
    );

    expect(images).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an excessive number of unique attachment references before querying storage", async () => {
    const attachments = Array.from({ length: 9 }, (_, index) => ({
      fileAssetId: `file-${index}`,
      filename: `figure-${index}.png`,
      mimeType: "image/png",
      size: PNG_BYTES.byteLength,
      isExisting: true,
    }));

    await expect(loadChatImageInputs(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      attachments,
    )).rejects.toThrow("at most 8 files");
    expect(mocks.prisma.fileAsset.findMany).not.toHaveBeenCalled();
  });

  it("rejects image batches above the aggregate byte limit before loading blobs", async () => {
    mocks.prisma.fileAsset.findMany.mockResolvedValue(
      ["file-1", "file-2", "file-3"].map((id) => ({
        ...createdFileAsset({
          filename: `${id}.png`,
          format: "png",
          mimeType: "image/png",
          size: 8 * 1024 * 1024,
        }),
        id,
      })),
    );
    const attachments = ["file-1", "file-2", "file-3"].map((fileAssetId) => ({
      fileAssetId,
      filename: `${fileAssetId}.png`,
      mimeType: "image/png",
      size: 8 * 1024 * 1024,
      isExisting: true,
    }));

    await expect(loadChatImageInputs(
      { ownerId: "user-1", workspaceId: "workspace-1" },
      "proj-1",
      attachments,
    )).rejects.toThrow("at most 20 MB in total");
    expect(fetch).not.toHaveBeenCalled();
  });
});
