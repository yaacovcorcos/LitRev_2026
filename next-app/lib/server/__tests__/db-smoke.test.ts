/**
 * Database Smoke Test
 *
 * This test verifies:
 * - Database connection works
 * - Single-user seed can be created/exists
 * - Basic Prisma operations succeed
 * - Demo project seed, reset, and deletion work end-to-end
 *
 * OPT-IN: Only runs when RUN_DB_TESTS=1 is set.
 * Run with: RUN_DB_TESTS=1 npm test -- db-smoke
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest'

const shouldRunDbTests = process.env.RUN_DB_TESTS === '1'
type DemoScope = { ownerId: string; workspaceId: string }

// Conditionally import to avoid connection errors when not running DB tests
let prisma: typeof import('@/lib/server/prisma').prisma
let openOrCreateDemoProject: typeof import('@/lib/server/demo-project').openOrCreateDemoProject
let resetDemoProject: typeof import('@/lib/server/demo-project').resetDemoProject
let DEMO_PROJECT_KEY: typeof import('@/lib/demo/constants').DEMO_PROJECT_KEY
const LOCAL_SCOPE = { ownerId: 'local-user', workspaceId: 'local-workspace' } as const
const SECOND_SCOPE = { ownerId: 'second-demo-user', workspaceId: 'second-demo-workspace' } as const

async function ensureScopePrincipal(scope: DemoScope = LOCAL_SCOPE) {
  await prisma.user.upsert({
    where: { id: scope.ownerId },
    update: {
      email: `${scope.ownerId}@local.invalid`,
      name: scope.ownerId === LOCAL_SCOPE.ownerId ? 'Local User' : 'Second Demo User',
      emailVerified: false,
    },
    create: {
      id: scope.ownerId,
      email: `${scope.ownerId}@local.invalid`,
      name: scope.ownerId === LOCAL_SCOPE.ownerId ? 'Local User' : 'Second Demo User',
      emailVerified: false,
    },
  })

  await prisma.workspace.upsert({
    where: { id: scope.workspaceId },
    update: { name: scope.workspaceId === LOCAL_SCOPE.workspaceId ? 'Local Workspace' : 'Second Demo Workspace' },
    create: {
      id: scope.workspaceId,
      name: scope.workspaceId === LOCAL_SCOPE.workspaceId ? 'Local Workspace' : 'Second Demo Workspace',
    },
  })

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: scope.workspaceId,
        userId: scope.ownerId,
      },
    },
    update: { role: 'owner' },
    create: {
      workspaceId: scope.workspaceId,
      userId: scope.ownerId,
      role: 'owner',
    },
  })

  return scope
}

async function deleteDemoProjectsForScopes(scopes: DemoScope[] = [LOCAL_SCOPE, SECOND_SCOPE]) {
  const demoProjects = await prisma.project.findMany({
    where: {
      demoKey: DEMO_PROJECT_KEY,
      OR: scopes.map((scope) => ({ ownerId: scope.ownerId, workspaceId: scope.workspaceId })),
    },
    select: { id: true },
  })
  const projectIds = demoProjects.map((project) => project.id)
  if (projectIds.length > 0) {
    await prisma.aIUsage.deleteMany({ where: { projectId: { in: projectIds } } })
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } })
  }
}

describe.skipIf(!shouldRunDbTests)('Database Smoke Test', () => {
  beforeAll(async () => {
    // Dynamic imports to prevent connection attempts when tests are skipped
    const prismaModule = await import('@/lib/server/prisma')
    prisma = prismaModule.prisma
  })

  afterAll(async () => {
    // Disconnect Prisma to prevent hanging test runner
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  it('connects to the database', async () => {
    // Simple query to verify connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`
    expect(result).toBeDefined()
  })

  it('creates local-user seed successfully', async () => {
    const scope = await ensureScopePrincipal()

    expect(scope).toEqual({
      ownerId: 'local-user',
      workspaceId: 'local-workspace',
    })
  })

  it('local-user seed is idempotent (can be called multiple times)', async () => {
    // Call twice - should not throw
    const scope1 = await ensureScopePrincipal()
    const scope2 = await ensureScopePrincipal()

    expect(scope1).toEqual(scope2)
  })

  it('user record exists after seeding', async () => {
    const user = await prisma.user.findUnique({
      where: { id: 'local-user' },
    })

    expect(user).not.toBeNull()
    expect(user?.id).toBe('local-user')
    expect(user?.name).toBe('Local User')
  })

  it('workspace record exists after seeding', async () => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: 'local-workspace' },
    })

    expect(workspace).not.toBeNull()
    expect(workspace?.id).toBe('local-workspace')
    expect(workspace?.name).toBe('Local Workspace')
  })

  it('workspace member relationship exists', async () => {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: 'local-workspace',
          userId: 'local-user',
        },
      },
    })

    expect(member).not.toBeNull()
    expect(member?.role).toBe('owner')
  })
})

describe.skipIf(!shouldRunDbTests)('Demo Project Integration', () => {
  beforeAll(async () => {
    const prismaModule = await import('@/lib/server/prisma')
    const demoModule = await import('@/lib/server/demo-project')
    const constants = await import('@/lib/demo/constants')

    prisma = prismaModule.prisma
    openOrCreateDemoProject = demoModule.openOrCreateDemoProject
    resetDemoProject = demoModule.resetDemoProject
    DEMO_PROJECT_KEY = constants.DEMO_PROJECT_KEY

    // Ensure seed user exists before demo tests
    await ensureScopePrincipal()
    await ensureScopePrincipal(SECOND_SCOPE)
    await deleteDemoProjectsForScopes()
  })

  afterAll(async () => {
    // Clean up demo project after tests.
    // AIUsage uses SET NULL so delete explicitly; all others cascade from Project.
    if (prisma) {
      try {
        await deleteDemoProjectsForScopes()
      } catch {
        // Best-effort cleanup
      }
      await prisma.$disconnect()
    }
  })

  it('openOrCreateDemoProject seeds the full demo project', async () => {
    const project = await openOrCreateDemoProject(LOCAL_SCOPE)

    expect(project).toBeDefined()
    expect(project.id).not.toBe('')
    expect(project.demoKey).toBe(DEMO_PROJECT_KEY)
    expect(project.name).toBe('Yoga for Anxiety')

    // Verify related data was seeded
    const studies = await prisma.study.findMany({ where: { projectId: project.id } })
    expect(studies.length).toBe(16)

    const protocol = await prisma.protocol.findFirst({ where: { projectId: project.id } })
    expect(protocol).not.toBeNull()

    const draft = await prisma.draft.findFirst({ where: { projectId: project.id } })
    expect(draft).not.toBeNull()

    const notes = await prisma.note.findMany({ where: { projectId: project.id } })
    expect(notes.length).toBe(8)

    const memories = await prisma.projectMemory.findMany({ where: { projectId: project.id } })
    expect(memories.length).toBe(8)

    const files = await prisma.fileAsset.findMany({ where: { projectId: project.id } })
    expect(files.length).toBe(2)

    const conversation = await prisma.aIConversation.findFirst({ where: { projectId: project.id } })
    expect(conversation).not.toBeNull()
    expect(conversation?.title).toBe('Sample walkthrough')
  })

  it('openOrCreateDemoProject is idempotent', async () => {
    const project1 = await openOrCreateDemoProject(LOCAL_SCOPE)
    const project2 = await openOrCreateDemoProject(LOCAL_SCOPE)

    expect(project1.id).toBe(project2.id)

    // Should still have exactly 16 studies (not duplicated)
    const studies = await prisma.study.findMany({ where: { projectId: project1.id } })
    expect(studies.length).toBe(16)
  })

  it('creates separate demo projects per scope', async () => {
    const project1 = await openOrCreateDemoProject(LOCAL_SCOPE)
    const project2 = await openOrCreateDemoProject(SECOND_SCOPE)

    expect(project1.id).not.toBe(project2.id)
    expect(project1.demoKey).toBe(DEMO_PROJECT_KEY)
    expect(project2.demoKey).toBe(DEMO_PROJECT_KEY)
  })

  it('resetDemoProject re-seeds studies and related data for the current scope', async () => {
    const originalProject = await openOrCreateDemoProject(LOCAL_SCOPE)
    const secondProject = await openOrCreateDemoProject(SECOND_SCOPE)

    // Delete a study to verify reset restores it
    const firstStudy = await prisma.study.findFirstOrThrow({
      where: { projectId: originalProject.id },
      orderBy: { createdAt: 'asc' },
    })
    await prisma.study.delete({ where: { id: firstStudy.id } })
    const beforeReset = await prisma.study.findMany({ where: { projectId: originalProject.id } })
    expect(beforeReset.length).toBe(15)

    const project = await resetDemoProject(LOCAL_SCOPE)
    expect(project).toBeDefined()
    expect(project.id).toBe(originalProject.id)

    // Studies restored to full count
    const afterReset = await prisma.study.findMany({ where: { projectId: originalProject.id } })
    expect(afterReset.length).toBe(16)

    // Related data also restored
    const notes = await prisma.note.findMany({ where: { projectId: originalProject.id } })
    expect(notes.length).toBe(8)

    const secondScopeStudies = await prisma.study.findMany({ where: { projectId: secondProject.id } })
    expect(secondScopeStudies.length).toBe(16)
  })

  it('project deletion cascades to all FK-linked models', async () => {
    // Ensure demo project exists with all seeded data
    const project = await openOrCreateDemoProject(LOCAL_SCOPE)

    // Seed rows for models not covered by the demo seed
    await prisma.agentRun.create({
      data: {
        id: 'test-agent-run-cascade',
        projectId: project.id,
        trigger: 'user_message',
        agentMode: 'general',
        status: 'completed',
      },
    })
    await prisma.memoryRetrieval.create({
      data: {
        id: 'test-retrieval-cascade',
        projectId: project.id,
        query: 'test query',
        memoryType: 'project',
        resultCount: 0,
      },
    })
    await prisma.autonomyConfig.create({
      data: {
        id: 'test-autonomy-cascade',
        projectId: project.id,
        preset: 'manual',
      },
    })
    // MemoryEmbedding uses Unsupported("vector") so we can't insert via Prisma client.
    // The FK constraint is structurally verified by the migration itself.

    // Insert a usage row so we can verify SET NULL behavior — capture its ID
    const usageRow = await prisma.aIUsage.create({
      data: {
        projectId: project.id,
        model: 'test-cascade-usage',
        inputTokens: 100,
        outputTokens: 50,
      },
    })

    // Single project delete — FK cascades should handle everything
    await prisma.project.delete({ where: { id: project.id } })

    // CASCADE models: all related data gone
    const studies = await prisma.study.findMany({ where: { projectId: project.id } })
    expect(studies.length).toBe(0)

    const notes = await prisma.note.findMany({ where: { projectId: project.id } })
    expect(notes.length).toBe(0)

    const memories = await prisma.projectMemory.findMany({ where: { projectId: project.id } })
    expect(memories.length).toBe(0)

    const conversations = await prisma.aIConversation.findMany({ where: { projectId: project.id } })
    expect(conversations.length).toBe(0)

    const agentRuns = await prisma.agentRun.findMany({ where: { projectId: project.id } })
    expect(agentRuns.length).toBe(0)

    const retrievals = await prisma.memoryRetrieval.findMany({ where: { projectId: project.id } })
    expect(retrievals.length).toBe(0)

    const autonomyConfigs = await prisma.autonomyConfig.findMany({ where: { projectId: project.id } })
    expect(autonomyConfigs.length).toBe(0)

    // SET NULL model: exact AIUsage row survives with projectId nulled out
    const survivedUsage = await prisma.aIUsage.findUnique({ where: { id: usageRow.id } })
    expect(survivedUsage).not.toBeNull()
    expect(survivedUsage?.projectId).toBeNull()

    // Cleanup the orphaned usage row
    await prisma.aIUsage.delete({ where: { id: usageRow.id } })
  })
})

// Provide helpful message when tests are skipped
describe.skipIf(shouldRunDbTests)('Database Smoke Test (SKIPPED)', () => {
  it('skipped - set RUN_DB_TESTS=1 to run database tests', () => {
    console.log('\n📋 Database tests skipped. To run them:')
    console.log('   RUN_DB_TESTS=1 npm test -- db-smoke\n')
    expect(true).toBe(true)
  })
})
