import "server-only";

import type { Study as PrismaStudy, StudyProcessingJob as PrismaStudyProcessingJob } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { STUDY_PROCESSING_INTERNAL_PATH } from "@/lib/server/study-processing-dispatch-auth";
import type { ScopeInput } from "@/lib/server/scope";
import { mergeDetails } from "@/lib/utils/merge";
import { extractStudyFromPdf, deepAnalyzeStudyFromPdf } from "@/lib/server/pdf-extraction";
import { createMemoriesFromDeepAnalysis } from "@/lib/server/memory/study-memory";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import type {
  Study,
  StudyDetails,
  StudyProcessingNextAction,
  StudyProcessingPhase,
  StudyProcessingPhaseSnapshot,
  StudyProcessingPriority,
  StudyProcessingRequestSource,
  StudyProcessingSnapshot,
  StudyProcessingState,
} from "@/types/ledger";

export type StudyProcessingTransitionHint = "accepted" | "upgraded" | "noop";

export type StudyProcessingStateItem = {
  studyId: string;
  processing: StudyProcessingSnapshot;
  study?: Study;
};

type StudyProcessingRow = PrismaStudyProcessingJob;

const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const PROCESSING_LEASE_RENEW_MS = 15 * 1000;

function emptyPhaseSnapshot(phase: StudyProcessingPhase): StudyProcessingPhaseSnapshot {
  return {
    phase,
    state: "idle",
    attemptCount: 0,
  };
}

function mapProcessingRow(row: StudyProcessingRow): StudyProcessingPhaseSnapshot {
  return {
    jobId: row.id,
    phase: row.phase as StudyProcessingPhase,
    state: row.state as StudyProcessingState,
    priority: row.priority as StudyProcessingPriority,
    requestSource: row.requestSource as StudyProcessingRequestSource,
    attemptCount: row.attemptCount,
    requestedAt: row.requestedAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    lastErrorCode: row.lastErrorCode ?? undefined,
    lastErrorMessage: row.lastErrorMessage ?? undefined,
  };
}

function deriveCurrentPhase(
  quickExtract: StudyProcessingPhaseSnapshot,
  deepAnalysis: StudyProcessingPhaseSnapshot,
): StudyProcessingPhase | undefined {
  if (quickExtract.state === "queued" || quickExtract.state === "running" || quickExtract.state === "failed") {
    return "quick_extract";
  }
  if (
    quickExtract.state === "succeeded" &&
    (deepAnalysis.state === "queued" || deepAnalysis.state === "running" || deepAnalysis.state === "failed")
  ) {
    return "deep_analysis";
  }
  return undefined;
}

function deriveNextAction(
  quickExtract: StudyProcessingPhaseSnapshot,
  deepAnalysis: StudyProcessingPhaseSnapshot,
): StudyProcessingNextAction {
  if (quickExtract.state === "queued" || quickExtract.state === "running") return "wait";
  if (quickExtract.state === "failed") return "retry";
  if (quickExtract.state !== "succeeded") return "extract";
  if (deepAnalysis.state === "queued" || deepAnalysis.state === "running") return "wait";
  if (deepAnalysis.state === "failed") return "retry";
  if (deepAnalysis.state !== "succeeded") return "analyze";
  return "none";
}

function toStudy(record: PrismaStudy, processing?: StudyProcessingSnapshot): Study {
  return {
    id: record.id,
    title: record.title,
    authors: record.authors,
    year: record.year,
    status: record.status as Study["status"],
    quality: record.quality as Study["quality"],
    details: (record.details as Study["details"]) ?? undefined,
    processing,
  };
}

function getDefaultQuickExtractState(study: {
  status: string;
}): StudyProcessingState {
  return study.status === "pending" ? "idle" : "succeeded";
}

function getDefaultDeepAnalysisState(study: {
  details: unknown;
}): StudyProcessingState {
  const details = (study.details as StudyDetails | null) ?? null;
  return details?.deepAnalysisComplete ? "succeeded" : "idle";
}

export function buildStudyProcessingSnapshotFromJobs(
  study: Pick<PrismaStudy, "status" | "details">,
  jobs: StudyProcessingRow[],
): StudyProcessingSnapshot {
  const quickRow = jobs.find((job) => job.phase === "quick_extract");
  const deepRow = jobs.find((job) => job.phase === "deep_analysis");

  const quickExtract = quickRow
    ? mapProcessingRow(quickRow)
    : { ...emptyPhaseSnapshot("quick_extract"), state: getDefaultQuickExtractState(study) };
  const deepAnalysis = deepRow
    ? mapProcessingRow(deepRow)
    : { ...emptyPhaseSnapshot("deep_analysis"), state: getDefaultDeepAnalysisState(study) };

  const currentPhase = deriveCurrentPhase(quickExtract, deepAnalysis);
  const currentState = currentPhase ? (currentPhase === "quick_extract" ? quickExtract.state : deepAnalysis.state) : "idle";
  const nextAction = deriveNextAction(quickExtract, deepAnalysis);

  return {
    byPhase: {
      quickExtract,
      deepAnalysis,
    },
    currentPhase,
    currentState,
    nextAction,
    prerequisitesSatisfied: {
      deepAnalysis: quickExtract.state === "succeeded",
    },
  };
}

export async function attachProcessingToStudies(studies: Study[]): Promise<Study[]> {
  if (studies.length === 0) return studies;
  const rows = await prisma.study.findMany({
    where: { id: { in: studies.map((study) => study.id) } },
    select: {
      id: true,
      status: true,
      details: true,
    },
  });
  const jobs = await prisma.studyProcessingJob.findMany({
    where: { studyId: { in: studies.map((study) => study.id) } },
  });
  const studyById = new Map(rows.map((row) => [row.id, row]));
  const jobsByStudyId = new Map<string, StudyProcessingRow[]>();
  for (const job of jobs) {
    const bucket = jobsByStudyId.get(job.studyId);
    if (bucket) {
      bucket.push(job);
    } else {
      jobsByStudyId.set(job.studyId, [job]);
    }
  }

  return studies.map((study) => {
    const row = studyById.get(study.id);
    if (!row) return study;
    return {
      ...study,
      processing: buildStudyProcessingSnapshotFromJobs(row, jobsByStudyId.get(study.id) ?? []),
    };
  });
}

export async function listStudiesWithProcessingByIds(
  scopeInput: ScopeInput,
  projectId: string,
  studyIds: string[],
): Promise<Study[]> {
  await assertProjectAccess(scopeInput, projectId);
  if (studyIds.length === 0) return [];

  const studies = await prisma.study.findMany({
    where: {
      projectId,
      deletedAt: null,
      id: { in: studyIds },
    },
    orderBy: { createdAt: "asc" },
  });
  const jobs = await prisma.studyProcessingJob.findMany({
    where: { projectId, studyId: { in: studyIds } },
  });
  const jobsByStudyId = new Map<string, StudyProcessingRow[]>();
  for (const job of jobs) {
    const bucket = jobsByStudyId.get(job.studyId);
    if (bucket) {
      bucket.push(job);
    } else {
      jobsByStudyId.set(job.studyId, [job]);
    }
  }

  return studies.map((study) =>
    toStudy(study, buildStudyProcessingSnapshotFromJobs(study, jobsByStudyId.get(study.id) ?? [])),
  );
}

function canRunDeepAnalysis(
  study: Pick<PrismaStudy, "status" | "details">,
  quickExtractRow: StudyProcessingRow | null,
): boolean {
  if (quickExtractRow?.state === "succeeded") return true;
  const details = (study.details as StudyDetails | null) ?? null;
  return study.status === "extracted" || Boolean(details?.deepAnalysisComplete);
}

async function fetchStudyForProcessing(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string,
) {
  await assertProjectAccess(scopeInput, projectId);
  const study = await prisma.study.findFirst({
    where: { id: studyId, projectId, deletedAt: null },
  });
  if (!study) {
    throw new Error("Study not found");
  }
  return study;
}

async function fetchFileForProcessing(
  projectId: string,
  studyId: string,
  fileAssetId?: string,
) {
  if (fileAssetId) {
    return prisma.fileAsset.findFirst({
      where: {
        id: fileAssetId,
        projectId,
        studyId,
      },
    });
  }

  return prisma.fileAsset.findFirst({
    where: {
      projectId,
      studyId,
      mimeType: "application/pdf",
    },
    orderBy: { createdAt: "desc" },
  });
}

function isHigherPriority(
  incoming: StudyProcessingPriority,
  existing: StudyProcessingPriority,
) {
  return incoming === "foreground" && existing === "background";
}

export async function enqueueStudyProcessingJob(
  scopeInput: ScopeInput,
  input: {
    projectId: string;
    studyId: string;
    phase: StudyProcessingPhase;
    priority: StudyProcessingPriority;
    requestSource: StudyProcessingRequestSource;
    fileAssetId?: string;
  },
): Promise<{ study: Study; processing: StudyProcessingSnapshot; transitionHint: StudyProcessingTransitionHint }> {
  const scope = await assertProjectAccess(scopeInput, input.projectId);
  const study = await fetchStudyForProcessing(scope, input.projectId, input.studyId);
  const file = await fetchFileForProcessing(input.projectId, input.studyId, input.fileAssetId);
  if (!file) {
    throw new Error("File not found");
  }
  if (file.mimeType !== "application/pdf" && file.format !== "pdf") {
    throw new Error("File is not a PDF");
  }

  const existing = await prisma.studyProcessingJob.findUnique({
    where: {
      studyId_phase: {
        studyId: input.studyId,
        phase: input.phase,
      },
    },
  });

  const quickExtract = input.phase === "quick_extract"
    ? existing
    : await prisma.studyProcessingJob.findUnique({
      where: {
        studyId_phase: {
          studyId: input.studyId,
          phase: "quick_extract",
        },
      },
    });

  if (input.phase === "deep_analysis" && !canRunDeepAnalysis(study, quickExtract)) {
    throw new Error("Study must finish extraction before deep analysis can start.");
  }

  let transitionHint: StudyProcessingTransitionHint = "accepted";

  if (!existing) {
    await prisma.studyProcessingJob.create({
      data: {
        studyId: input.studyId,
        projectId: input.projectId,
        workspaceId: scope.workspaceId,
        fileAssetId: file.id,
        phase: input.phase,
        state: "queued",
        priority: input.priority,
        requestSource: input.requestSource,
      },
    });
  } else if (existing.state === "queued" || existing.state === "running") {
    if (isHigherPriority(input.priority, existing.priority as StudyProcessingPriority)) {
      transitionHint = "upgraded";
      await prisma.studyProcessingJob.update({
        where: { id: existing.id },
        data: {
          priority: input.priority,
          requestSource: input.requestSource,
          fileAssetId: file.id,
        },
      });
    } else {
      transitionHint = "noop";
    }
  } else if (existing.state === "failed") {
    await prisma.studyProcessingJob.update({
      where: { id: existing.id },
      data: {
        state: "queued",
        priority: input.priority,
        requestSource: input.requestSource,
        fileAssetId: file.id,
        requestedAt: new Date(),
        startedAt: null,
        leaseExpiresAt: null,
        completedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  } else {
    transitionHint = "noop";
  }

  const [freshStudy] = await listStudiesWithProcessingByIds(scope, input.projectId, [input.studyId]);
  return {
    study: freshStudy,
    processing: freshStudy.processing ?? buildStudyProcessingSnapshotFromJobs(study, []),
    transitionHint,
  };
}

export async function prioritizeStudyProcessingJob(
  scopeInput: ScopeInput,
  input: {
    projectId: string;
    studyId: string;
    phase: StudyProcessingPhase;
  },
): Promise<{ study: Study; processing: StudyProcessingSnapshot; transitionHint: StudyProcessingTransitionHint }> {
  const scope = await assertProjectAccess(scopeInput, input.projectId);
  const existing = await prisma.studyProcessingJob.findUnique({
    where: {
      studyId_phase: {
        studyId: input.studyId,
        phase: input.phase,
      },
    },
  });

  if (
    !existing ||
    existing.priority === "foreground" ||
    (existing.state !== "queued" && existing.state !== "running")
  ) {
    const [study] = await listStudiesWithProcessingByIds(scope, input.projectId, [input.studyId]);
    if (!study) {
      throw new Error("Study not found");
    }
    return {
      study,
      processing: study.processing ?? buildStudyProcessingSnapshotFromJobs({
        status: study.status,
        details: study.details ?? null,
      } as Pick<PrismaStudy, "status" | "details">, []),
      transitionHint: "noop",
    };
  }

  await prisma.studyProcessingJob.update({
    where: { id: existing.id },
    data: {
      priority: "foreground",
      requestSource: "study_page_focus",
    },
  });

  const [study] = await listStudiesWithProcessingByIds(scope, input.projectId, [input.studyId]);
  return {
    study,
    processing: study.processing!,
    transitionHint: "upgraded",
  };
}

export async function listStudyProcessingStateItems(
  scopeInput: ScopeInput,
  projectId: string,
  studyIds: string[],
): Promise<StudyProcessingStateItem[]> {
  const studies = await listStudiesWithProcessingByIds(scopeInput, projectId, studyIds);
  return studies.map((study) => ({
    studyId: study.id,
    processing: study.processing!,
    study,
  }));
}

async function requeueExpiredStudyProcessingJobs() {
  const now = new Date();
  await prisma.studyProcessingJob.updateMany({
    where: {
      state: "running",
      leaseExpiresAt: { lt: now },
    },
    data: {
      state: "queued",
      startedAt: null,
      leaseExpiresAt: null,
      lastErrorCode: "LEASE_EXPIRED",
      lastErrorMessage: "Previous processing lease expired; job requeued.",
      requestedAt: now,
      completedAt: null,
    },
  });
}

async function claimNextStudyProcessingJob(): Promise<StudyProcessingRow | null> {
  await requeueExpiredStudyProcessingJobs();
  const candidate = await prisma.studyProcessingJob.findFirst({
    where: { state: "queued" },
    orderBy: [
      { priority: "desc" },
      { requestedAt: "asc" },
    ],
  });
  if (!candidate) return null;

  const now = new Date();
  const startedAt = now;
  const leaseExpiresAt = new Date(now.getTime() + PROCESSING_LEASE_MS);
  const claimed = await prisma.studyProcessingJob.updateMany({
    where: {
      id: candidate.id,
      state: "queued",
    },
    data: {
      state: "running",
      startedAt,
      leaseExpiresAt,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (claimed.count === 0) return null;
  return prisma.studyProcessingJob.findUnique({ where: { id: candidate.id } });
}

async function renewStudyProcessingLease(jobId: string, startedAt: Date) {
  await prisma.studyProcessingJob.updateMany({
    where: {
      id: jobId,
      state: "running",
      startedAt,
    },
    data: {
      leaseExpiresAt: new Date(Date.now() + PROCESSING_LEASE_MS),
    },
  });
}

function normalizeErrorCode(errorCode?: string) {
  if (!errorCode) return undefined;
  return errorCode;
}

async function handleQuickExtractJob(job: StudyProcessingRow, startedAt: Date) {
  const study = await prisma.study.findUnique({ where: { id: job.studyId } });
  const file = job.fileAssetId
    ? await prisma.fileAsset.findUnique({ where: { id: job.fileAssetId } })
    : null;

  if (!study || !file) {
    await prisma.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "failed",
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: !study ? "STUDY_NOT_FOUND" : "FILE_NOT_FOUND",
        lastErrorMessage: !study ? "Study not found." : "PDF file not found.",
      },
    });
    return {
      success: false,
      studyId: job.studyId,
    } as const;
  }

  const result = await extractStudyFromPdf(file.storagePath, job.projectId);
  if (!result.success) {
    await prisma.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "failed",
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: normalizeErrorCode(result.errorCode) ?? "EXTRACTION_FAILED",
        lastErrorMessage: result.error ?? "Extraction failed.",
      },
    });
    return {
      success: false,
      studyId: job.studyId,
    } as const;
  }

  const existingDetails = (study.details as Record<string, unknown> | null) ?? {};
  const mergedDetails = mergeDetails(existingDetails, {
    ...result.details,
    source: "pdf-import",
  });

  await prisma.$transaction(async (tx) => {
    await tx.study.update({
      where: { id: study.id },
      data: {
        title: result.title ?? study.title,
        authors: result.authors ?? study.authors,
        year: result.year ?? study.year,
        status: "extracted",
        details: mergedDetails as object,
      },
    });
    await tx.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "succeeded",
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
  });

  return {
    success: true,
    studyId: job.studyId,
  } as const;
}

async function handleDeepAnalysisJob(job: StudyProcessingRow, startedAt: Date) {
  const study = await prisma.study.findUnique({ where: { id: job.studyId } });
  const file = job.fileAssetId
    ? await prisma.fileAsset.findUnique({ where: { id: job.fileAssetId } })
    : null;

  if (!study || !file) {
    await prisma.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "failed",
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: !study ? "STUDY_NOT_FOUND" : "FILE_NOT_FOUND",
        lastErrorMessage: !study ? "Study not found." : "PDF file not found.",
      },
    });
    return {
      success: false,
      studyId: job.studyId,
    } as const;
  }

  const details = (study.details as StudyDetails | null) ?? undefined;
  const result = await deepAnalyzeStudyFromPdf(
    file.storagePath,
    {
      title: study.title,
      authors: study.authors,
      details,
    },
    job.projectId,
  );

  if (!result.success) {
    await prisma.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "failed",
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: normalizeErrorCode(result.errorCode) ?? "AI_FAILED",
        lastErrorMessage: result.error ?? "Deep analysis failed.",
      },
    });
    return {
      success: false,
      studyId: job.studyId,
    } as const;
  }

  const mergedDetails = mergeDetails((study.details as Record<string, unknown> | null) ?? {}, {
    ...result.details,
    deepAnalysisComplete: true,
  });

  await prisma.$transaction(async (tx) => {
    await tx.study.update({
      where: { id: study.id },
      data: {
        quality: result.quality ?? study.quality,
        details: mergedDetails as object,
      },
    });
    await tx.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "succeeded",
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
  });

  await createMemoriesFromDeepAnalysis(
    study.id,
    job.projectId,
    mergedDetails as Record<string, unknown>,
    result.quality,
  ).catch((error) => {
    logServerError("study-processing", "deep analysis memory creation failed", {
      projectId: job.projectId,
      studyId: study.id,
    }, error);
  });

  return {
    success: true,
    studyId: job.studyId,
  } as const;
}

export async function processOneStudyProcessingJob() {
  const job = await claimNextStudyProcessingJob();
  if (!job || !job.startedAt) {
    return { processed: false } as const;
  }

  const startedAt = job.startedAt;
  const heartbeat = setInterval(() => {
    void renewStudyProcessingLease(job.id, startedAt).catch((error) => {
      logServerWarn("study-processing", "failed to renew processing lease", {
        jobId: job.id,
      }, error);
    });
  }, PROCESSING_LEASE_RENEW_MS);

  try {
    if (job.phase === "quick_extract") {
      const result = await handleQuickExtractJob(job, startedAt);
      return { processed: true, ...result } as const;
    }

    if (job.phase === "deep_analysis") {
      const result = await handleDeepAnalysisJob(job, startedAt);
      return { processed: true, ...result } as const;
    }

    await prisma.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "failed",
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: "UNSUPPORTED_PHASE",
        lastErrorMessage: `Unsupported processing phase: ${job.phase}`,
      },
    });
    return { processed: true, success: false, studyId: job.studyId } as const;
  } catch (error) {
    logServerError("study-processing", "job processing failed", {
      jobId: job.id,
      projectId: job.projectId,
      studyId: job.studyId,
      phase: job.phase,
    }, error);
    await prisma.studyProcessingJob.updateMany({
      where: { id: job.id, state: "running", startedAt },
      data: {
        state: "failed",
        completedAt: new Date(),
        leaseExpiresAt: null,
        lastErrorCode: "PROCESSING_ERROR",
        lastErrorMessage: error instanceof Error ? error.message : "Study processing failed.",
      },
    });
    return { processed: true, success: false, studyId: job.studyId } as const;
  } finally {
    clearInterval(heartbeat);
  }
}

function getDispatcherBaseUrl(): URL | null {
  const candidates = [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    process.env.VERCEL_URL?.startsWith("http")
      ? process.env.VERCEL_URL
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return new URL(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

function startLocalStudyProcessingDispatcherFallback(): void {
  void processOneStudyProcessingJob().catch((error) => {
    logServerWarn("study-processing", "local direct dispatcher fallback failed", undefined, error);
  });
}

export async function kickStudyProcessingDispatcher() {
  const token = process.env.STUDY_PROCESSING_INTERNAL_TOKEN;
  const baseUrl = getDispatcherBaseUrl();
  if (process.env.NODE_ENV === "test") {
    return false;
  }

  if (!token || !baseUrl) {
    if (process.env.NODE_ENV !== "production") {
      startLocalStudyProcessingDispatcherFallback();
      return true;
    }

    logServerWarn("study-processing", "best-effort dispatcher kick unavailable in deployed environment", {
      hasInternalToken: Boolean(token),
      hasBaseUrl: Boolean(baseUrl),
      nodeEnv: process.env.NODE_ENV ?? "undefined",
    });
    return false;
  }

  const dispatcherUrl = new URL(STUDY_PROCESSING_INTERNAL_PATH, baseUrl).toString();

  try {
    const response = await fetch(dispatcherUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    return response.ok;
  } catch (error) {
    logServerWarn("study-processing", "best-effort dispatcher kick failed", undefined, error);
    return false;
  }
}
