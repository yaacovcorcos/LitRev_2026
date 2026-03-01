import "server-only";

import { lookup } from "node:dns/promises";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { PdfDownloadErrorCode } from "@/types/pdf-fetch";

const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_REDIRECTS = 4;

const LOCAL_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export class PdfDownloadError extends Error {
  code: PdfDownloadErrorCode;
  status?: number;

  constructor(code: PdfDownloadErrorCode, message: string, status?: number) {
    super(message);
    this.name = "PdfDownloadError";
    this.code = code;
    this.status = status;
  }
}

export type DownloadPdfResult = {
  buffer: Buffer;
  contentType: string | null;
  finalUrl: string;
  redirects: number;
  checksumSha256: string;
  size: number;
};

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b, c] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // RFC 6598 shared address space
  if (a === 198 && (b === 18 || b === 19)) return true; // RFC 2544 benchmarking
  if (a === 192 && b === 0 && c === 0) return true; // RFC 6890 IETF protocol assignments
  if (a >= 224) return true; // multicast/reserved ranges
  if (a === 255) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized.startsWith("::ffff:")) return true;
  const mappedV4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedV4?.[1] && isPrivateIpv4(mappedV4[1])) return true;
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function assertPublicNetworkTarget(url: URL): Promise<void> {
  const hostname = url.hostname.toLowerCase();
  const hostForIpCheck =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  if (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".local")) {
    throw new PdfDownloadError("BLOCKED_URL", `Blocked local hostname: ${url.hostname}`);
  }

  const ipType = isIP(hostForIpCheck);
  if (ipType === 4 && isPrivateIpv4(hostForIpCheck)) {
    throw new PdfDownloadError("BLOCKED_URL", `Blocked private IPv4 address: ${hostForIpCheck}`);
  }
  if (ipType === 6 && isPrivateIpv6(hostForIpCheck)) {
    throw new PdfDownloadError("BLOCKED_URL", `Blocked private IPv6 address: ${hostForIpCheck}`);
  }
  if (ipType !== 0) {
    return;
  }

  try {
    const records = await lookup(hostForIpCheck, { all: true });
    for (const record of records) {
      const recordIpType = isIP(record.address);
      if (recordIpType === 4 && isPrivateIpv4(record.address)) {
        throw new PdfDownloadError(
          "BLOCKED_URL",
          `Blocked hostname resolving to private IPv4: ${hostname}`
        );
      }
      if (recordIpType === 6 && isPrivateIpv6(record.address)) {
        throw new PdfDownloadError(
          "BLOCKED_URL",
          `Blocked hostname resolving to private IPv6: ${hostname}`
        );
      }
    }
  } catch (error) {
    if (error instanceof PdfDownloadError) throw error;
    throw new PdfDownloadError(
      "NETWORK_ERROR",
      `Unable to resolve hostname ${hostname}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

function assertHttpProtocol(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PdfDownloadError(
      "UNSUPPORTED_PROTOCOL",
      `Unsupported protocol for PDF download: ${url.protocol}`
    );
  }
}

function assertPdfMagicBytes(buffer: Buffer): void {
  if (buffer.length < 5) {
    throw new PdfDownloadError("INVALID_PDF", "Response body too small to be a valid PDF.");
  }
  const header = buffer.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    throw new PdfDownloadError("INVALID_PDF", "Downloaded content is not a valid PDF.");
  }
}

async function readBodyWithSizeLimit(response: Response, maxSizeBytes: number): Promise<Buffer> {
  const body = response.body;
  if (!body) {
    const arrayBuffer = await response.arrayBuffer();
    const fallback = Buffer.from(arrayBuffer);
    if (fallback.length > maxSizeBytes) {
      throw new PdfDownloadError(
        "PAYLOAD_TOO_LARGE",
        `PDF exceeds size limit (${fallback.length} bytes).`
      );
    }
    return fallback;
  }

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxSizeBytes) {
      await reader.cancel();
      throw new PdfDownloadError("PAYLOAD_TOO_LARGE", `PDF exceeds size limit (${total} bytes).`);
    }
    chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
  return Buffer.concat(chunks, total);
}

export async function downloadPdfWithGuards(
  url: string,
  options?: {
    maxSizeBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
  }
): Promise<DownloadPdfResult> {
  const maxSizeBytes = options?.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = options?.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = new URL(url);
  let redirects = 0;

  while (true) {
    assertHttpProtocol(currentUrl);
    await assertPublicNetworkTarget(currentUrl);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.1",
          "User-Agent": "LitRev/1.0 (+https://litrev.app)",
        },
      });
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (isRedirect) {
        if (redirects >= maxRedirects) {
          throw new PdfDownloadError(
            "TOO_MANY_REDIRECTS",
            `Too many redirects while downloading PDF (${maxRedirects}).`
          );
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new PdfDownloadError(
            "NETWORK_ERROR",
            "Redirect response missing Location header."
          );
        }
        currentUrl = new URL(location, currentUrl);
        redirects += 1;
        continue;
      }

      if (!response.ok) {
        throw new PdfDownloadError(
          "HTTP_ERROR",
          `Failed to download PDF: HTTP ${response.status}`,
          response.status
        );
      }

      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        const contentLength = Number.parseInt(contentLengthHeader, 10);
        if (Number.isFinite(contentLength) && contentLength > maxSizeBytes) {
          throw new PdfDownloadError(
            "PAYLOAD_TOO_LARGE",
            `PDF is too large (${contentLength} bytes).`
          );
        }
      }

      let buffer: Buffer;
      try {
        buffer = await readBodyWithSizeLimit(response, maxSizeBytes);
      } catch (error) {
        if (error instanceof PdfDownloadError) throw error;
        throw new PdfDownloadError(
          "NETWORK_ERROR",
          `Failed reading PDF response body: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }

      assertPdfMagicBytes(buffer);

      const checksumSha256 = createHash("sha256").update(buffer).digest("hex");
      return {
        buffer,
        contentType: response.headers.get("content-type"),
        finalUrl: currentUrl.toString(),
        redirects,
        checksumSha256,
        size: buffer.length,
      };
    } catch (error) {
      if (error instanceof PdfDownloadError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new PdfDownloadError(
          "NETWORK_ERROR",
          `Timed out while downloading PDF after ${timeoutMs}ms.`
        );
      }
      throw new PdfDownloadError(
        "NETWORK_ERROR",
        `Network error while downloading PDF: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
