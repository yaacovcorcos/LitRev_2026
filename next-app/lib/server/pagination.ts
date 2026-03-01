/**
 * Shared cursor-based pagination types and helpers.
 * Used by ledger, notes, draft-versions, and their corresponding actions.
 */

export interface PaginationOptions {
    cursor?: string;
    limit?: number;
}

export interface PaginatedResult<T> {
    items: T[];
    nextCursor: string | null;
}

const DEFAULT_PAGINATION_LIMIT = 50;
const MAX_PAGINATION_LIMIT = 200;

export function sanitizePaginationLimit(limit?: number): number {
    if (!Number.isFinite(limit) || !limit || limit <= 0) return DEFAULT_PAGINATION_LIMIT;
    return Math.min(Math.floor(limit), MAX_PAGINATION_LIMIT);
}
