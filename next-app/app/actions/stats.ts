"use server";

import { prisma } from "@/lib/server/prisma";
import {
  sanitizeErrorMessage,
  withValidatedAction,
  type ActionResult,
} from "@/lib/server/action-utils";
import { withAuth, type AuthContext } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import type { DraftState } from "@/lib/draftStorage";
import type { ProtocolData } from "@/types/protocol";
import { DRAFT_SECTIONS } from "@/types/draft";

type ProjectAccessScope = Pick<AuthContext, "userId" | "workspaceId">;

// ---------------------------------------------------------------------------
// Draft Stats
// ---------------------------------------------------------------------------

export type DraftStats = {
  sections: { key: string; label: string; hasContent: boolean }[];
  completedCount: number;
  totalCount: number;
};

export type OverviewPreviewSlice<T> = {
  data: T | null;
  error: string | null;
};

/** Check if a Tiptap JSONContent node tree contains any actual text */
function hasText(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const node = doc as { type?: string; text?: string; content?: unknown[] };
  if (typeof node.text === "string" && node.text.trim().length > 0) return true;
  if (Array.isArray(node.content)) {
    return node.content.some(hasText);
  }
  return false;
}

export async function getDraftStatsAction(
  projectId: string,
): Promise<ActionResult<DraftStats | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth((context) => readDraftStats(id, context)),
  );
}

// ---------------------------------------------------------------------------
// Protocol Stats
// ---------------------------------------------------------------------------

export type ProtocolStats = {
  criteriaCount: number;
  hasResearchQuestion: boolean;
  updatedAt: string;
};

export async function getProtocolStatsAction(
  projectId: string,
): Promise<ActionResult<ProtocolStats | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth((context) => readProtocolStats(id, context)),
  );
}

// ---------------------------------------------------------------------------
// Ledger Stats
// ---------------------------------------------------------------------------

export type LedgerStats = {
  totalStudies: number;
  extractedCount: number;
  screenedCount: number;
  pendingCount: number;
};

export type ProjectOverviewStats = {
  draft: OverviewPreviewSlice<DraftStats>;
  protocol: OverviewPreviewSlice<ProtocolStats>;
  ledger: OverviewPreviewSlice<LedgerStats>;
};

export async function getLedgerStatsAction(
  projectId: string,
): Promise<ActionResult<LedgerStats | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth((context) => readLedgerStats(id, context)),
  );
}

export async function getProjectOverviewStatsAction(
  projectId: string,
): Promise<ActionResult<ProjectOverviewStats>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(async (context) => {
      const [draft, protocol, ledger] = await Promise.all([
        readOverviewSlice(() => readDraftStats(id, context), "Could not load draft preview."),
        readOverviewSlice(() => readProtocolStats(id, context), "Could not load protocol preview."),
        readOverviewSlice(() => readLedgerStats(id, context), "Could not load ledger preview."),
      ]);

      return { draft, protocol, ledger };
    }),
  );
}

async function readDraftStats(
  projectId: string,
  { userId, workspaceId }: ProjectAccessScope,
): Promise<DraftStats | null> {
  const draft = await prisma.draft.findFirst({
    where: {
      projectId,
      project: { ownerId: userId, workspaceId },
    },
  });
  if (!draft) return null;

  const state = draft.state as DraftState;
  const sectionOrder = state.sectionOrder ?? [];
  const contentBySection = state.contentBySection ?? {};

  const sectionLabelMap = new Map<string, string>(
    DRAFT_SECTIONS.map((s) => [s.key, s.label]),
  );

  const sections = sectionOrder.map((key) => {
    const label =
      sectionLabelMap.get(key) ??
      state.customSections?.[key]?.label ??
      key;
    const content = contentBySection[key];
    return { key, label, hasContent: hasText(content) };
  });

  const completedCount = sections.filter((s) => s.hasContent).length;

  return {
    sections,
    completedCount,
    totalCount: sections.length,
  };
}

async function readProtocolStats(
  projectId: string,
  { userId, workspaceId }: ProjectAccessScope,
): Promise<ProtocolStats | null> {
  const protocol = await prisma.protocol.findFirst({
    where: {
      projectId,
      project: { ownerId: userId, workspaceId },
    },
    select: { data: true, updatedAt: true },
  });
  if (!protocol) return null;

  const data = protocol.data as unknown as ProtocolData;
  const inclusionCount = data.eligibility?.inclusion?.filter((s) => s.trim().length > 0).length ?? 0;
  const exclusionCount = data.eligibility?.exclusion?.filter((s) => s.trim().length > 0).length ?? 0;

  return {
    criteriaCount: inclusionCount + exclusionCount,
    hasResearchQuestion: (data.researchQuestion ?? "").trim().length > 0,
    updatedAt: protocol.updatedAt.toISOString(),
  };
}

async function readLedgerStats(
  projectId: string,
  { userId, workspaceId }: ProjectAccessScope,
): Promise<LedgerStats | null> {
  const studies = await prisma.study.findMany({
    where: {
      projectId,
      project: { ownerId: userId, workspaceId },
    },
    select: { status: true },
  });

  if (studies.length === 0) return null;

  let extractedCount = 0;
  let screenedCount = 0;
  let pendingCount = 0;

  for (const study of studies) {
    switch (study.status) {
      case "extracted":
        extractedCount++;
        break;
      case "excluded":
      case "active":
        screenedCount++;
        break;
      default:
        pendingCount++;
        break;
    }
  }

  return {
    totalStudies: studies.length,
    extractedCount,
    screenedCount,
    pendingCount,
  };
}

async function readOverviewSlice<T>(
  fn: () => Promise<T | null>,
  fallbackMessage: string,
): Promise<OverviewPreviewSlice<T>> {
  try {
    return {
      data: await fn(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: sanitizeErrorMessage(error, fallbackMessage),
    };
  }
}
