import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLookup = vi.fn();

vi.mock("node:dns/promises", () => ({
  lookup: (...args: unknown[]) => mockLookup(...args),
}));

describe("downloadPdfWithGuards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("blocks URLs that resolve to private networks", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { downloadPdfWithGuards } = await import("@/lib/server/pdf-download");

    await expect(downloadPdfWithGuards("https://blocked.example/private.pdf")).rejects.toMatchObject({
      name: "PdfDownloadError",
      code: "BLOCKED_URL",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks special-use literal IPv4 ranges (CGNAT)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { downloadPdfWithGuards } = await import("@/lib/server/pdf-download");

    await expect(downloadPdfWithGuards("https://100.64.1.10/paper.pdf")).rejects.toMatchObject({
      name: "PdfDownloadError",
      code: "BLOCKED_URL",
    });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks IPv4-mapped loopback IPv6 literals", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { downloadPdfWithGuards } = await import("@/lib/server/pdf-download");

    await expect(downloadPdfWithGuards("https://[::ffff:127.0.0.1]/paper.pdf")).rejects.toMatchObject({
      name: "PdfDownloadError",
      code: "BLOCKED_URL",
    });
    expect(mockLookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows redirects and returns checksum for valid PDFs", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const pdfBody = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "utf-8");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example/final.pdf" },
        })
      )
      .mockResolvedValueOnce(
        new Response(pdfBody, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        })
      );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { downloadPdfWithGuards } = await import("@/lib/server/pdf-download");
    const result = await downloadPdfWithGuards("https://origin.example/start.pdf");

    expect(result.finalUrl).toBe("https://cdn.example/final.pdf");
    expect(result.redirects).toBe(1);
    expect(result.size).toBe(pdfBody.length);
    expect(result.checksumSha256).toHaveLength(64);
  });

  it("rejects non-PDF content", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>not pdf</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { downloadPdfWithGuards } = await import("@/lib/server/pdf-download");

    await expect(downloadPdfWithGuards("https://example.com/file.pdf")).rejects.toMatchObject({
      name: "PdfDownloadError",
      code: "INVALID_PDF",
    });
  });

  it("rejects oversized PDFs even when content-length is missing", async () => {
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const oversized = Buffer.concat([
      Buffer.from("%PDF-1.7\n", "utf-8"),
      Buffer.alloc(2048, 0x20),
    ]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(oversized, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );
    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const { downloadPdfWithGuards } = await import("@/lib/server/pdf-download");

    await expect(
      downloadPdfWithGuards("https://example.com/large.pdf", { maxSizeBytes: 256 })
    ).rejects.toMatchObject({
      name: "PdfDownloadError",
      code: "PAYLOAD_TOO_LARGE",
    });
  });
});
