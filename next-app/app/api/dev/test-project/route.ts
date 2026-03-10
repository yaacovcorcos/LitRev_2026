import { NextRequest, NextResponse } from "next/server";
import { createProject } from "@/lib/server/projects";
import {
  buildFixtureProjectDescription,
  createDevFixtureProjectId,
  ensureDevQuickLoginIdentity,
  isDevQuickLoginAllowed,
} from "@/lib/server/auth/dev-quick-login";

export async function POST(request: NextRequest) {
  if (!isDevQuickLoginAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    seedKey?: string | null;
  };

  const name = body.name?.trim() || `E2E Project ${Date.now()}`;
  const identity = await ensureDevQuickLoginIdentity(body.seedKey);
  const now = new Date().toISOString();

  const project = await createProject(
    {
      ownerId: identity.userId,
      workspaceId: identity.workspaceId,
    },
    {
      id: createDevFixtureProjectId(),
      name,
      description: buildFixtureProjectDescription(body.seedKey, body.description),
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
    projectId: project.id,
  });
}
