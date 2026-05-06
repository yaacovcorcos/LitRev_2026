import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { createProject } from "@/lib/server/projects";
import {
  buildFixtureProjectDescription,
  createDevFixtureProjectId,
  ensureDevQuickLoginIdentity,
  getDevQuickLoginIdentity,
  hasTrustedDevQuickLoginOrigin,
  isDevQuickLoginAllowed,
} from "@/lib/server/auth/dev-quick-login";

type HomeState = "empty_workspace" | "workspace" | "zero_state";
type CanonicalHomeState = "empty_workspace" | "workspace";
const DEFAULT_WORKSPACE_PROJECT_COUNT = 1;
const MAX_WORKSPACE_PROJECT_COUNT = 24;

function isHomeState(value: string | undefined): value is HomeState {
  return value === "empty_workspace" || value === "workspace" || value === "zero_state";
}

function normalizeHomeState(state: HomeState): CanonicalHomeState {
  return state === "zero_state" ? "empty_workspace" : state;
}

function buildFixtureWhere(seedKey: string): Prisma.ProjectWhereInput {
  const identity = getDevQuickLoginIdentity(seedKey);
  return {
    ownerId: identity.userId,
    workspaceId: identity.workspaceId,
    OR: [
      { demoKey: { not: null } },
      { description: { startsWith: identity.fixtureTag } },
    ],
  };
}

export async function POST(request: NextRequest) {
  if (!isDevQuickLoginAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!hasTrustedDevQuickLoginOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    seedKey?: string | null;
    state?: string;
    projectCount?: number;
  };

  const seedKey = body.seedKey?.trim();
  if (!seedKey) {
    return NextResponse.json({ error: "seedKey is required" }, { status: 400 });
  }

  if (!isHomeState(body.state)) {
    return NextResponse.json({ error: "state must be empty_workspace or workspace" }, { status: 400 });
  }

  const state = normalizeHomeState(body.state);

  const requestedProjectCount =
    typeof body.projectCount === "undefined" ? DEFAULT_WORKSPACE_PROJECT_COUNT : body.projectCount;

  if (
    !Number.isInteger(requestedProjectCount) ||
    requestedProjectCount < 1 ||
    requestedProjectCount > MAX_WORKSPACE_PROJECT_COUNT
  ) {
    return NextResponse.json({
      error: `projectCount must be an integer between 1 and ${MAX_WORKSPACE_PROJECT_COUNT}`,
    }, { status: 400 });
  }

  const identity = await ensureDevQuickLoginIdentity(seedKey);
  const fixtureWhere = buildFixtureWhere(seedKey);

  if (state === "empty_workspace") {
    const deleted = await prisma.project.deleteMany({
      where: fixtureWhere,
    });

    return NextResponse.json({
      ok: true,
      state,
      deletedCount: deleted.count,
    });
  }

  const existingProjects = await prisma.project.findMany({
    where: fixtureWhere,
    select: { id: true },
    orderBy: { modified: "desc" },
  });

  if (existingProjects.length === requestedProjectCount) {
    return NextResponse.json({
      ok: true,
      state,
      projectId: existingProjects[0].id,
      projectCount: existingProjects.length,
    });
  }

  if (existingProjects.length > 0) {
    await prisma.project.deleteMany({
      where: fixtureWhere,
    });
  }

  const baseTime = Date.now();
  const projects = await Promise.all(
    Array.from({ length: requestedProjectCount }, (_, index) => {
      const isoTimestamp = new Date(baseTime - index * 60_000).toISOString();
      const label = requestedProjectCount === 1
        ? "E2E workspace state project"
        : `E2E workspace state project ${index + 1}`;

      return createProject(
        {
          ownerId: identity.userId,
          workspaceId: identity.workspaceId,
        },
        {
          id: createDevFixtureProjectId(`workspace-${index + 1}`),
          name: requestedProjectCount === 1
            ? "E2E Workspace Project"
            : `E2E Workspace Project ${index + 1}`,
          description: buildFixtureProjectDescription(seedKey, label),
          status: "ready",
          statusText: "Ready for review",
          created: isoTimestamp,
          modified: isoTimestamp,
          progress: {
            phase: "ready",
            percent: 100,
            papers: 0,
          },
        },
      );
    }),
  );

  return NextResponse.json({
    ok: true,
    state,
    projectId: projects[0].id,
    projectCount: projects.length,
  });
}
