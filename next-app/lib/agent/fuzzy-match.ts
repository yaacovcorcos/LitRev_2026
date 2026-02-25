export type FuzzyMatchPass = 1 | 2 | 3 | 4;

export type FuzzyMatchResult = {
  index: number;
  pass: FuzzyMatchPass;
};

export type FuzzyListMatchResult = {
  index: number;
  candidate: string;
  pass: FuzzyMatchPass;
};

function rstripLines(value: string): string {
  return value.split("\n").map((line) => line.trimEnd()).join("\n");
}

function trimLines(value: string): string {
  return value.split("\n").map((line) => line.trim()).join("\n");
}

export function normalizeUnicodeForFuzzyMatch(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, "\"")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function looseContains(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  if (needle.length < 8 || haystack.length < 8) return false;
  return haystack.includes(needle) || needle.includes(haystack);
}

function runPass(
  haystack: string,
  needle: string,
  pass: FuzzyMatchPass
): number {
  if (pass === 1) return haystack.indexOf(needle);
  if (pass === 2) return rstripLines(haystack).indexOf(rstripLines(needle));
  if (pass === 3) return trimLines(haystack).indexOf(trimLines(needle));
  return normalizeUnicodeForFuzzyMatch(trimLines(haystack)).indexOf(
    normalizeUnicodeForFuzzyMatch(trimLines(needle))
  );
}

function runPassEquals(
  left: string,
  right: string,
  pass: FuzzyMatchPass
): boolean {
  if (pass === 1) return looseContains(left, right);
  if (pass === 2) return looseContains(rstripLines(left), rstripLines(right));
  if (pass === 3) return looseContains(trimLines(left), trimLines(right));
  return looseContains(
    normalizeUnicodeForFuzzyMatch(trimLines(left)),
    normalizeUnicodeForFuzzyMatch(trimLines(right))
  );
}

export function fuzzyMatch(haystack: string, needle: string): FuzzyMatchResult | null {
  if (!haystack || !needle) return null;
  const passes: FuzzyMatchPass[] = [1, 2, 3, 4];
  for (const pass of passes) {
    const index = runPass(haystack, needle, pass);
    if (index !== -1) return { index, pass };
  }
  return null;
}

export function findBestFuzzyListMatch(
  candidates: string[],
  needle: string
): FuzzyListMatchResult | null {
  if (!needle.trim()) return null;
  let best: FuzzyListMatchResult | null = null;
  const passes: FuzzyMatchPass[] = [1, 2, 3, 4];

  for (const pass of passes) {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index] ?? "";
      if (!runPassEquals(candidate, needle, pass)) continue;
      const next: FuzzyListMatchResult = { index, candidate, pass };
      if (!best) {
        best = next;
        continue;
      }
      const bestDistance = Math.abs(best.candidate.length - needle.length);
      const nextDistance = Math.abs(candidate.length - needle.length);
      if (next.pass < best.pass || (next.pass === best.pass && nextDistance < bestDistance)) {
        best = next;
      }
    }
    if (best?.pass === pass) break;
  }
  return best;
}
