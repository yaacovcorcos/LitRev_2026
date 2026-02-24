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

// Conditionally import to avoid connection errors when not running DB tests
let prisma: typeof import('@/lib/server/prisma').prisma
let ensureSingleUserSeed: typeof import('@/lib/server/bootstrap').ensureSingleUserSeed
let SINGLE_USER_SCOPE: typeof import('@/lib/server/scope').SINGLE_USER_SCOPE
let openOrCreateDemoProject: typeof import('@/lib/server/demo-project').openOrCreateDemoProject
let resetDemoProject: typeof import('@/lib/server/demo-project').resetDemoProject
let DEMO_PROJECT_ID: typeof import('@/lib/demo/constants').DEMO_PROJECT_ID

describe.skipIf(!shouldRunDbTests)('Database Smoke Test', () => {
  beforeAll(async () => {
    // Dynamic imports to prevent connection attempts when tests are skipped
    const prismaModule = await import('@/lib/server/prisma')
    const bootstrapModule = await import('@/lib/server/bootstrap')
    const scopeModule = await import('@/lib/server/scope')

    prisma = prismaModule.prisma
    ensureSingleUserSeed = bootstrapModule.ensureSingleUserSeed
    SINGLE_USER_SCOPE = scopeModule.SINGLE_USER_SCOPE
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

  it('creates single-user seed successfully', async () => {
    const scope = await ensureSingleUserSeed(SINGLE_USER_SCOPE)

    expect(scope).toEqual({
      ownerId: 'local-user',
      workspaceId: 'local-workspace',
    })
  })

  it('single-user seed is idempotent (can be called multiple times)', async () => {
    // Call twice - should not throw
    const scope1 = await ensureSingleUserSeed(SINGLE_USER_SCOPE)
    const scope2 = await ensureSingleUserSeed(SINGLE_USER_SCOPE)

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
    const bootstrapModule = await import('@/lib/server/bootstrap')
    const scopeModule = await import('@/lib/server/scope')
    const demoModule = await import('@/lib/server/demo-project')
    const constants = await import('@/lib/demo/constants')

    prisma = prismaModule.prisma
    ensureSingleUserSeed = bootstrapModule.ensureSingleUserSeed
    SINGLE_USER_SCOPE = scopeModule.SINGLE_USER_SCOPE
    openOrCreateDemoProject = demoModule.openOrCreateDemoProject
    resetDemoProject = demoModule.resetDemoProject
    DEMO_PROJECT_ID = constants.DEMO_PROJECT_ID

    // Ensure seed user exists before demo tests
    await ensureSingleUserSeed(SINGLE_USER_SCOPE)
  })

  afterAll(async () => {
    // Clean up demo project after tests.
    // AIUsage uses SET NULL so delete explicitly; all others cascade from Project.
    if (prisma) {
      try {
        await prisma.aIUsage.deleteMany({ where: { projectId: DEMO_PROJECT_ID } })
        await prisma.project.deleteMany({ where: { id: DEMO_PROJECT_ID } })
      } catch {
        // Best-effort cleanup
      }
      await prisma.$disconnect()
    }
  })

  it('openOrCreateDemoProject seeds the full demo project', async () => {
    const project = await openOrCreateDemoProject(SINGLE_USER_SCOPE)

    expect(project).toBeDefined()
    expect(project.id).toBe(DEMO_PROJECT_ID)
    expect(project.name).toBe('Yoga for Anxiety')

    // Verify related data was seeded
    const studies = await prisma.study.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(studies.length).toBe(12)

    const protocol = await prisma.protocol.findFirst({ where: { projectId: DEMO_PROJECT_ID } })
    expect(protocol).not.toBeNull()

    const draft = await prisma.draft.findFirst({ where: { projectId: DEMO_PROJECT_ID } })
    expect(draft).not.toBeNull()

    const notes = await prisma.note.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(notes.length).toBe(3)

    const memories = await prisma.projectMemory.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(memories.length).toBe(4)

    const files = await prisma.fileAsset.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(files.length).toBe(2)

    const conversation = await prisma.aIConversation.findFirst({ where: { projectId: DEMO_PROJECT_ID } })
    expect(conversation).not.toBeNull()
    expect(conversation?.title).toBe('Sample walkthrough')
  })

  it('openOrCreateDemoProject is idempotent', async () => {
    const project1 = await openOrCreateDemoProject(SINGLE_USER_SCOPE)
    const project2 = await openOrCreateDemoProject(SINGLE_USER_SCOPE)

    expect(project1.id).toBe(project2.id)

    // Should still have exactly 12 studies (not duplicated)
    const studies = await prisma.study.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(studies.length).toBe(12)
  })

  it('resetDemoProject re-seeds studies and related data', async () => {
    // Delete a study to verify reset restores it
    await prisma.study.delete({ where: { id: 'demo-study-broota-1994' } })
    const beforeReset = await prisma.study.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(beforeReset.length).toBe(11)

    const project = await resetDemoProject(SINGLE_USER_SCOPE, DEMO_PROJECT_ID)
    expect(project).toBeDefined()
    expect(project.id).toBe(DEMO_PROJECT_ID)

    // Studies restored to full count
    const afterReset = await prisma.study.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(afterReset.length).toBe(12)

    // Related data also restored
    const notes = await prisma.note.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(notes.length).toBe(3)
  })

  it('resetDemoProject rejects non-demo project IDs', async () => {
    await expect(
      resetDemoProject(SINGLE_USER_SCOPE, 'some-other-project')
    ).rejects.toThrow('Only the sample project can be reset')
  })

  it('project deletion cascades to all FK-linked models', async () => {
    // Ensure demo project exists with all seeded data
    await openOrCreateDemoProject(SINGLE_USER_SCOPE)

    // Seed rows for models not covered by the demo seed
    await prisma.agentRun.create({
      data: {
        id: 'test-agent-run-cascade',
        projectId: DEMO_PROJECT_ID,
        trigger: 'user_message',
        agentMode: 'general',
        status: 'completed',
      },
    })
    await prisma.memoryRetrieval.create({
      data: {
        id: 'test-retrieval-cascade',
        projectId: DEMO_PROJECT_ID,
        query: 'test query',
        memoryType: 'project',
        resultCount: 0,
      },
    })
    await prisma.autonomyConfig.create({
      data: {
        id: 'test-autonomy-cascade',
        projectId: DEMO_PROJECT_ID,
        preset: 'manual',
      },
    })
    // MemoryEmbedding uses Unsupported("vector") so we can't insert via Prisma client.
    // The FK constraint is structurally verified by the migration itself.

    // Insert a usage row so we can verify SET NULL behavior — capture its ID
    const usageRow = await prisma.aIUsage.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        model: 'test-cascade-usage',
        inputTokens: 100,
        outputTokens: 50,
      },
    })

    // Single project delete — FK cascades should handle everything
    await prisma.project.delete({ where: { id: DEMO_PROJECT_ID } })

    // CASCADE models: all related data gone
    const studies = await prisma.study.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(studies.length).toBe(0)

    const notes = await prisma.note.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(notes.length).toBe(0)

    const memories = await prisma.projectMemory.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(memories.length).toBe(0)

    const conversations = await prisma.aIConversation.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(conversations.length).toBe(0)

    const agentRuns = await prisma.agentRun.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(agentRuns.length).toBe(0)

    const retrievals = await prisma.memoryRetrieval.findMany({ where: { projectId: DEMO_PROJECT_ID } })
    expect(retrievals.length).toBe(0)

    const autonomyConfigs = await prisma.autonomyConfig.findMany({ where: { projectId: DEMO_PROJECT_ID } })
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
