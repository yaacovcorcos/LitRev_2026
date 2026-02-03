import type { Study } from "@/types/ledger";

export type StudyInput = Omit<Study, "id"> & { id?: string };

export type NormalizedStudy = {
  id?: string;
  title: string;
  authors: string;
  year: number;
  status: string;
  quality: string;
  details?: Record<string, unknown>;
};

/**
 * Normalize study input to ensure consistent data.
 * - Trims whitespace from strings
 * - Sets defaults for missing required fields
 * - Validates year is a finite number
 */
export function normalizeStudy(input: StudyInput): NormalizedStudy {
  const title = input.title?.trim() || "Untitled Study";
  const authors = input.authors?.trim() || "Unknown";
  const year =
    typeof input.year === "number" && Number.isFinite(input.year)
      ? input.year
      : new Date().getFullYear();
  const status = input.status?.toString().trim() || "pending";
  const quality = input.quality?.toString().trim() || "-";
  const details = input.details
    ? (input.details as Record<string, unknown>)
    : undefined;
  return {
    id: input.id ?? undefined,
    title,
    authors,
    year,
    status,
    quality,
    details,
  };
}
