import path from "node:path";

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "::1"] as const;

export type PerformanceArtifactRoots = {
  baselineRoot: string;
  resultsRoot: string;
};

type ResolvePathArgs = {
  cwd: string;
  inputPath: string;
  label: string;
  allowedRoots: string[];
};

type BaseUrlArgs = {
  allowedHosts?: string[];
  allowedOrigins?: string[];
};

function isWithinRoot(candidatePath: string, allowedRoot: string): boolean {
  const normalizedCandidate = path.resolve(candidatePath);
  const normalizedRoot = path.resolve(allowedRoot);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function normalizeOrigin(value: string): string {
  return value.toLowerCase().replace(/\/$/, "");
}

export function parseAllowList(value: string | undefined): string[] {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) ?? [];
}

export function createPerformanceArtifactRoots(repoRoot: string): PerformanceArtifactRoots {
  return {
    baselineRoot: path.resolve(repoRoot, "output", "performance", "baseline"),
    resultsRoot: path.resolve(repoRoot, "output", "performance", "results"),
  };
}

export function resolvePathWithinRoots({
  cwd,
  inputPath,
  label,
  allowedRoots,
}: ResolvePathArgs): string {
  const resolvedPath = path.resolve(cwd, inputPath);
  if (allowedRoots.some((allowedRoot) => isWithinRoot(resolvedPath, allowedRoot))) {
    return resolvedPath;
  }

  throw new Error(
    `[invalid-${label}-path] ${resolvedPath}: must stay within ${allowedRoots.join(" or ")}`,
  );
}

export function validatePerformanceProbeBaseUrl(
  rawUrl: string,
  {
    allowedHosts = [],
    allowedOrigins = [],
  }: BaseUrlArgs = {},
): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`[invalid-base-url] ${rawUrl}: must be a valid absolute URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`[invalid-base-url] ${rawUrl}: protocol must be http or https`);
  }

  if (url.username || url.password) {
    throw new Error(`[invalid-base-url] ${rawUrl}: credentials are not allowed`);
  }

  if (url.search || url.hash) {
    throw new Error(`[invalid-base-url] ${rawUrl}: query strings and fragments are not allowed`);
  }

  const normalizedOrigin = normalizeOrigin(url.origin);
  const normalizedAllowedOrigins = new Set(allowedOrigins.map((origin) => normalizeOrigin(origin)));
  const normalizedAllowedHosts = new Set([
    ...LOOPBACK_HOSTS,
    ...allowedHosts.map((host) => host.toLowerCase()),
  ]);

  if (
    !normalizedAllowedHosts.has(url.hostname.toLowerCase()) &&
    !normalizedAllowedOrigins.has(normalizedOrigin)
  ) {
    throw new Error(
      `[invalid-base-url] ${rawUrl}: host must be loopback or explicitly allowlisted`,
    );
  }

  return url.origin;
}
