import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteFileAssetBlob, fetchFileAssetBytes, getClientFileAssetUrls } from "@/lib/server/file-storage";

describe("file-storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://supabase.example.com";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.com";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.SUPABASE_STORAGE_BUCKET = "study-assets";
    vi.stubGlobal("fetch", vi.fn());
  });

  it("derives safe client URLs for canonical project-owned study files", () => {
    expect(
      getClientFileAssetUrls({
        id: "file-1",
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "paper.pdf",
        mimeType: "application/pdf",
        storagePath: "study-assets/projects/proj-1/studies/study-1/paper.pdf",
        publicUrl: "https://malicious.example.com/not-used.pdf",
      }),
    ).toEqual({
      downloadUrl: "/api/projects/proj-1/files/file-1",
    });
  });

  it("fails closed for malformed or cross-project paths", () => {
    expect(
      getClientFileAssetUrls({
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "paper.pdf",
        mimeType: "application/pdf",
        storagePath: "study-assets/projects/proj-2/studies/study-1/paper.pdf",
      }),
    ).toEqual({});

    expect(
      getClientFileAssetUrls({
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "paper.pdf",
        mimeType: "application/pdf",
        storagePath: "study-assets/projects/proj-1/studies/../study-1/paper.pdf",
      }),
    ).toEqual({});

    expect(
      getClientFileAssetUrls({
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "paper.pdf",
        mimeType: "application/pdf",
        storagePath: "external/projects/proj-1/studies/study-1/paper.pdf",
      }),
    ).toEqual({});
  });

  it("only allows the explicit external/demo namespace as legacy compatibility", () => {
    expect(
      getClientFileAssetUrls({
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "demo-paper.pdf",
        mimeType: "application/pdf",
        storagePath: "external/demo/demo-paper.pdf",
        publicUrl: "https://example.com/demo-paper.pdf",
      }),
    ).toEqual({
      publicUrl: "https://example.com/demo-paper.pdf",
      downloadUrl: "https://example.com/demo-paper.pdf",
    });

    expect(
      getClientFileAssetUrls({
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "demo-paper.pdf",
        mimeType: "application/pdf",
        storagePath: "external/demo/demo-paper.pdf",
        publicUrl: "https://pubmed.ncbi.nlm.nih.gov/17220622/",
      }),
    ).toEqual({
      publicUrl: "https://pubmed.ncbi.nlm.nih.gov/17220622/",
      downloadUrl: undefined,
    });

    expect(
      getClientFileAssetUrls({
        projectId: "proj-1",
        studyId: "study-1",
        kind: "source",
        filename: "demo-paper.pdf",
        mimeType: "application/pdf",
        storagePath: "external/other/demo-paper.pdf",
        publicUrl: "https://example.com/demo-paper.pdf",
      }),
    ).toEqual({});
  });

  it("rejects poisoned file rows before privileged fetch", async () => {
    const fetchMock = vi.mocked(fetch);

    await expect(
      fetchFileAssetBytes(
        {
          projectId: "proj-1",
          studyId: "study-1",
          kind: "source",
          filename: "paper.pdf",
          mimeType: "application/pdf",
          storagePath: "study-assets/projects/proj-2/studies/study-1/paper.pdf",
        },
        { projectId: "proj-1", studyId: "study-1" },
      ),
    ).rejects.toThrow("Invalid file storage location.");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never deletes blobs for external-demo rows", async () => {
    const fetchMock = vi.mocked(fetch);

    const deleted = await deleteFileAssetBlob({
      projectId: "proj-1",
      studyId: "study-1",
      kind: "source",
      filename: "demo-paper.pdf",
      mimeType: "application/pdf",
      storagePath: "external/demo/demo-paper.pdf",
      publicUrl: "https://example.com/demo-paper.pdf",
    });

    expect(deleted).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
