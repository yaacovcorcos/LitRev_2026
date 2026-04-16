import type { Study } from "@/types/ledger";
import type { DraftAuxiliaryReference } from "@/lib/draft-import/types";
import { mergeAuxiliaryBibliography } from "./normalize";
import { parseBibtexBibliography } from "./bibtex";
import { parseCslJsonBibliography } from "./csl-json";
import { parseRisBibliography } from "./ris";

export function parseBibliographyByFormat(
  format: "csl-json" | "ris" | "bibtex",
  input: string,
  studies: Study[],
): DraftAuxiliaryReference[] {
  switch (format) {
    case "csl-json":
      return mergeAuxiliaryBibliography([], parseCslJsonBibliography(input, studies));
    case "ris":
      return mergeAuxiliaryBibliography([], parseRisBibliography(input, studies));
    case "bibtex":
      return mergeAuxiliaryBibliography([], parseBibtexBibliography(input, studies));
    default: {
      const exhaustive: never = format;
      throw new Error(`Unsupported bibliography format: ${String(exhaustive)}`);
    }
  }
}

export { mergeAuxiliaryBibliography, normalizeDoi, normalizePmid, normalizeYear } from "./normalize";
