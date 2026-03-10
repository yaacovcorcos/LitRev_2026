import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { createProject } from "@/lib/server/projects";
import {
  buildFixtureProjectDescription,
  createDevFixtureProjectId,
  ensureDevQuickLoginIdentity,
  getDevQuickLoginIdentity,
  isDevQuickLoginAllowed,
} from "@/lib/server/auth/dev-quick-login";

type HomeState = "zero_state" | "workspace";

function isHomeState(value: string | undefined): value is HomeState {
  return value === "zero_state" || value === "workspace";
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

  const body = (await request.json().catch(() => ({}))) as {
    seedKey?: string | null;
    state?: string;
  };

  const seedKey = body.seedKey?.trim();
  if (!seedKey) {
    return NextResponse.json({ error: "seedKey is required" }, { status: 400 });
  }

  if (!isHomeState(body.state)) {
    return NextResponse.json({ error: "state must be zero_state or workspace" }, { status: 400 });
  }

  const identity = await ensureDevQuickLoginIdentity(seedKey);
  const fixtureWhere = buildFixtureWhere(seedKey);

  if (body.state === "zero_state") {
    const deleted = await prisma.project.deleteMany({
      where: fixtureWhere,
    });

    return NextResponse.json({
      ok: true,
      state: body.state,
      deletedCount: deleted.count,
    });
  }

  const existingProject = await prisma.project.findFirst({
    where: fixtureWhere,
    select: { id: true },
  });

  if (existingProject) {
    return NextResponse.json({
      ok: true,
      state: body.state,
      projectId: existingProject.id,
    });
  }

  const now = new Date().toISOString();
  const project = await createProject(
    {
      ownerId: identity.userId,
      workspaceId: identity.workspaceId,
    },
    {
      id: createDevFixtureProjectId("workspace"),
      name: "E2E Workspace Project",
      description: buildFixtureProjectDescription(seedKey, "E2E workspace state project"),
      status: "ready",
      statusText: "Ready for review",
      created: now,
      modified: now,
      progress: {
        phase: "ready",
        percent: 100,
        papers: 0,
      },
    },
  );

  return NextResponse.json({
    ok: true,
    state: body.state,
    projectId: project.id,
  });
}
