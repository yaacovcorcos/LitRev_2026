import type { JSONContent } from "@tiptap/core";
import type { DraftSectionId } from "@/types/draft";
import type { Study } from "@/types/ledger";

export type CitationIssueType = "missing_study_id" | "missing_study" | "excluded_study" | "missing_metadata";

export type CitationIssue = {
    type: CitationIssueType;
    sectionId: DraftSectionId;
    uid: string;
    studyId?: string;
    message: string;
};

export type ResolvedCitationNode = {
    sectionId: DraftSectionId;
    uid: string;
    studyId?: string;
    number?: number;
};

export type CompiledCitations = {
    normalizedContentBySection: Record<DraftSectionId, JSONContent>;
    orderedStudyIds: string[];
    numberByStudyId: Record<string, number>;
    citations: ResolvedCitationNode[];
    issues: CitationIssue[];
};

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function asNode(node: JSONContent | undefined): JSONContent {
    return node && isObject(node) ? node : { type: "doc", content: [{ type: "paragraph" }] };
}

function ensureUid(sectionId: DraftSectionId, counter: number, existing?: string): string {
    const trimmed = typeof existing === "string" ? existing.trim() : "";
    if (trimmed) return trimmed;
    return `cit-${sectionId}-${counter}`;
}

function normalizeStudyId(attrs: Record<string, unknown>): string | undefined {
    const direct = typeof attrs.studyId === "string" ? attrs.studyId.trim() : "";
    if (direct) return direct;
    const legacy = typeof attrs.id === "string" ? attrs.id.trim() : "";
    return legacy || undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function rewriteCitationNodeStudyIds(params: {
    node: JSONContent;
    replacements: Record<string, string>;
    changedRef: { count: number };
}): JSONContent {
    const { node, replacements, changedRef } = params;
    const nextNode: JSONContent = { ...node };

    if (node.type === "citation") {
        const attrs = isObject(node.attrs) ? { ...node.attrs } : {};
        const studyId = normalizeStudyId(attrs);
        if (studyId) {
            const replacement = replacements[studyId];
            if (replacement && replacement !== studyId) {
                attrs.studyId = replacement;
                delete attrs.id;
                changedRef.count += 1;
            } else if (attrs.id && !attrs.studyId) {
                // Canonicalize legacy id attr when no replacement is needed.
                attrs.studyId = studyId;
                delete attrs.id;
                changedRef.count += 1;
            }
        }
        nextNode.attrs = attrs;
        return nextNode;
    }

    if (Array.isArray(node.content)) {
        nextNode.content = node.content.map((child) =>
            rewriteCitationNodeStudyIds({
                node: child,
                replacements,
                changedRef,
            }),
        );
    }

    return nextNode;
}

export function rewriteCitationStudyIdsInDoc(
    doc: JSONContent,
    replacements: Record<string, string>,
): { content: JSONContent; changedCount: number } {
    const changedRef = { count: 0 };
    const content = rewriteCitationNodeStudyIds({
        node: asNode(doc),
        replacements,
        changedRef,
    });
    return { content, changedCount: changedRef.count };
}

export function rewriteCitationStudyIdsInContentBySection(
    contentBySection: Record<DraftSectionId, JSONContent>,
    replacements: Record<string, string>,
): {
    contentBySection: Record<DraftSectionId, JSONContent>;
    changedCount: number;
    changedSections: DraftSectionId[];
} {
    let changedCount = 0;
    const changedSections: DraftSectionId[] = [];
    const next: Record<DraftSectionId, JSONContent> = { ...contentBySection };

    for (const [sectionId, content] of Object.entries(contentBySection)) {
        const rewritten = rewriteCitationStudyIdsInDoc(content, replacements);
        if (rewritten.changedCount > 0) {
            next[sectionId] = rewritten.content;
            changedCount += rewritten.changedCount;
            changedSections.push(sectionId);
        }
    }

    return { contentBySection: next, changedCount, changedSections };
}

function transformNode(params: {
    node: JSONContent;
    sectionId: DraftSectionId;
    nodeCounterRef: { value: number };
    numberByStudyId: Map<string, number>;
    orderedStudyIds: string[];
    citations: ResolvedCitationNode[];
    issues: CitationIssue[];
    includeNumberInNodes: boolean;
}): JSONContent {
    const { node, sectionId, nodeCounterRef, numberByStudyId, orderedStudyIds, citations, issues, includeNumberInNodes } = params;
    const nextNode: JSONContent = { ...node };

    if (node.type === "citation") {
        nodeCounterRef.value += 1;
        const attrs = isObject(node.attrs) ? { ...node.attrs } : {};
        const uid = ensureUid(sectionId, nodeCounterRef.value, typeof attrs.uid === "string" ? attrs.uid : undefined);
        const studyId = normalizeStudyId(attrs);

        let number: number | undefined;
        if (studyId) {
            if (!numberByStudyId.has(studyId)) {
                const assigned = orderedStudyIds.length + 1;
                orderedStudyIds.push(studyId);
                numberByStudyId.set(studyId, assigned);
            }
            number = numberByStudyId.get(studyId);
        } else {
            issues.push({
                type: "missing_study_id",
                sectionId,
                uid,
                message: "Citation node is missing studyId.",
            });
        }

        citations.push({ sectionId, uid, studyId, number });

        const nextAttrs: Record<string, unknown> = {
            uid,
        };
        if (studyId) {
            nextAttrs.studyId = studyId;
        }
        const locator = normalizeOptionalText(attrs.locator);
        const prefix = normalizeOptionalText(attrs.prefix);
        const suffix = normalizeOptionalText(attrs.suffix);
        if (locator) nextAttrs.locator = locator;
        if (prefix) nextAttrs.prefix = prefix;
        if (suffix) nextAttrs.suffix = suffix;
        if (includeNumberInNodes && typeof number === "number") {
            nextAttrs.number = number;
        }
        nextNode.attrs = nextAttrs;
        delete (nextNode.attrs as Record<string, unknown>).id;
        return nextNode;
    }

    if (Array.isArray(node.content)) {
        nextNode.content = node.content.map((child) =>
            transformNode({
                node: child,
                sectionId,
                nodeCounterRef,
                numberByStudyId,
                orderedStudyIds,
                citations,
                issues,
                includeNumberInNodes,
            }),
        );
    }

    return nextNode;
}

export function compileDraftCitations(params: {
    contentBySection: Record<DraftSectionId, JSONContent>;
    sectionOrder: DraftSectionId[];
    studies?: Study[];
    includeNumberInNodes?: boolean;
}): CompiledCitations {
    const { contentBySection, sectionOrder, studies = [], includeNumberInNodes = false } = params;
    const numberByStudyId = new Map<string, number>();
    const orderedStudyIds: string[] = [];
    const citations: ResolvedCitationNode[] = [];
    const issues: CitationIssue[] = [];
    const normalizedContentBySection: Record<DraftSectionId, JSONContent> = { ...contentBySection };
    const nodeCounterRef = { value: 0 };

    const effectiveOrder = sectionOrder.length > 0 ? sectionOrder : Object.keys(contentBySection);

    for (const sectionId of effectiveOrder) {
        if (sectionId === "references") continue;
        const source = asNode(contentBySection[sectionId]);
        normalizedContentBySection[sectionId] = transformNode({
            node: source,
            sectionId,
            nodeCounterRef,
            numberByStudyId,
            orderedStudyIds,
            citations,
            issues,
            includeNumberInNodes,
        });
    }

    const studyById = new Map(studies.map((study) => [study.id, study]));
    for (const citation of citations) {
        if (!citation.studyId) continue;
        const study = studyById.get(citation.studyId);
        if (!study) {
            issues.push({
                type: "missing_study",
                sectionId: citation.sectionId,
                uid: citation.uid,
                studyId: citation.studyId,
                message: `Study ${citation.studyId} is missing from ledger.`,
            });
            continue;
        }

        if (study.status === "excluded") {
            issues.push({
                type: "excluded_study",
                sectionId: citation.sectionId,
                uid: citation.uid,
                studyId: citation.studyId,
                message: `Study ${citation.studyId} is excluded but cited in draft.`,
            });
        }

        const hasAnyIdentifier = Boolean(study.details?.doi || study.details?.pmid);
        if (!hasAnyIdentifier) {
            issues.push({
                type: "missing_metadata",
                sectionId: citation.sectionId,
                uid: citation.uid,
                studyId: citation.studyId,
                message: `Study ${citation.studyId} is cited without DOI/PMID metadata.`,
            });
        }
    }

    return {
        normalizedContentBySection,
        orderedStudyIds,
        numberByStudyId: Object.fromEntries(numberByStudyId.entries()),
        citations,
        issues,
    };
}

export function formatReferenceEntry(study: Study, number: number): string {
    const journalInfo = study.details?.journal ? ` *${study.details.journal}*.` : "";
    const doiInfo = study.details?.doi ? ` https://doi.org/${study.details.doi}` : "";
    return `${number}. ${study.authors} (${study.year}). ${study.title}.${journalInfo}${doiInfo}`;
}

export function buildReferencesDoc(orderedStudyIds: string[], studies: Study[]): JSONContent {
    if (orderedStudyIds.length === 0) {
        return {
            type: "doc",
            content: [{ type: "paragraph" }],
        };
    }

    const studyById = new Map(studies.map((study) => [study.id, study]));
    const paragraphs: JSONContent[] = [];

    orderedStudyIds.forEach((studyId, index) => {
        const study = studyById.get(studyId);
        const text = study
            ? formatReferenceEntry(study, index + 1)
            : `${index + 1}. Missing study metadata for ${studyId}.`;
        paragraphs.push({
            type: "paragraph",
            content: [{ type: "text", text }],
        });
    });

    return {
        type: "doc",
        content: paragraphs,
    };
}

export function getCitedSectionIdsByStudyId(params: {
    citations: ResolvedCitationNode[];
    studyId: string;
}): DraftSectionId[] {
    const unique = new Set<DraftSectionId>();
    for (const citation of params.citations) {
        if (citation.studyId !== params.studyId) continue;
        unique.add(citation.sectionId);
    }
    return Array.from(unique);
}

export function hasBlockingCitationIssues(issues: CitationIssue[]): boolean {
    return issues.some((issue) => issue.type === "missing_study_id" || issue.type === "missing_study");
}
