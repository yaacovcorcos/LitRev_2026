export type SearchCountFacts = {
  returnedCount?: number;
  totalResults?: number;
};

export type SearchCountBasis = "returned" | "total";

export type SearchMagnitude = {
  value: number;
  basis: SearchCountBasis;
};

function isConcreteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function getSearchMagnitude(facts: SearchCountFacts): SearchMagnitude | null {
  if (isConcreteCount(facts.totalResults)) {
    return {
      value: facts.totalResults,
      basis: "total",
    };
  }

  if (isConcreteCount(facts.returnedCount)) {
    return {
      value: facts.returnedCount,
      basis: "returned",
    };
  }

  return null;
}

export function formatSearchCountDetail(facts: SearchCountFacts): string | null {
  if (isConcreteCount(facts.returnedCount) && isConcreteCount(facts.totalResults)) {
    return `${facts.returnedCount} of ${facts.totalResults} results`;
  }

  if (isConcreteCount(facts.returnedCount)) {
    return `Returned ${facts.returnedCount} results`;
  }

  if (isConcreteCount(facts.totalResults)) {
    return `${facts.totalResults} total results`;
  }

  return null;
}

export function formatSearchSummary(sourceLabel: string, facts: SearchCountFacts): string | undefined {
  if (isConcreteCount(facts.returnedCount) && isConcreteCount(facts.totalResults)) {
    return `Found ${facts.returnedCount} of ${facts.totalResults} ${sourceLabel} results.`;
  }

  if (isConcreteCount(facts.returnedCount)) {
    return `Returned ${facts.returnedCount} ${sourceLabel} results.`;
  }

  if (isConcreteCount(facts.totalResults)) {
    return `Found ${facts.totalResults} ${sourceLabel} results.`;
  }

  return undefined;
}

export function formatSearchMagnitudeSentence(sourceLabel: string, magnitude: SearchMagnitude): string {
  if (magnitude.basis === "total") {
    return `${sourceLabel} found ${magnitude.value} total results`;
  }

  return `${sourceLabel} returned ${magnitude.value} results`;
}

export function formatSearchMagnitudeDeltaSentence(
  sourceLabel: string,
  previousMagnitude: SearchMagnitude,
  nextMagnitude: SearchMagnitude,
): string | null {
  if (previousMagnitude.basis !== nextMagnitude.basis) return null;

  const basisLabel = nextMagnitude.basis === "total"
    ? "total result set"
    : "returned result page";

  if (nextMagnitude.value < previousMagnitude.value) {
    return `The latest ${sourceLabel} search narrowed the ${basisLabel} from ${previousMagnitude.value} to ${nextMagnitude.value} results.`;
  }

  if (nextMagnitude.value > previousMagnitude.value) {
    return `The latest ${sourceLabel} search broadened the ${basisLabel} from ${previousMagnitude.value} to ${nextMagnitude.value} results.`;
  }

  return null;
}

export function parseOpaqueOffsetCursor(
  cursor: string | undefined,
  sourceLabel: string,
): number | undefined {
  if (cursor === undefined) return undefined;
  const trimmed = cursor.trim();
  if (!trimmed) {
    throw new Error(`${sourceLabel} cursor must be a non-negative integer continuation token.`);
  }
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    throw new Error(`${sourceLabel} cursor must be a non-negative integer continuation token.`);
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${sourceLabel} cursor must be a non-negative integer continuation token.`);
  }

  return parsed;
}
