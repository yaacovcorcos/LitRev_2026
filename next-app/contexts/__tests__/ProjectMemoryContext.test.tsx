// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectMemoryProvider,
  useProjectMemory,
} from "@/contexts/ProjectMemoryContext";

const mocks = vi.hoisted(() => ({
  getProjectMemoriesAction: vi.fn(),
  addProjectDataChangedListener: vi.fn(),
}));

vi.mock("@/app/actions/memory", () => ({
  createProjectMemoryAction: vi.fn(),
  updateProjectMemoryAction: vi.fn(),
  archiveProjectMemoryAction: vi.fn(),
  deleteProjectMemoryAction: vi.fn(),
  getProjectMemoriesAction: mocks.getProjectMemoriesAction,
}));

vi.mock("@/lib/project-data-events", () => ({
  addProjectDataChangedListener: mocks.addProjectDataChangedListener,
}));

function Consumer() {
  const { memories, isLoading } = useProjectMemory();
  return (
    <div>
      <span data-testid="count">{memories.length}</span>
      <span data-testid="loading">{String(isLoading)}</span>
    </div>
  );
}

function renderWithProvider(initialData?: Parameters<typeof ProjectMemoryProvider>[0]["initialData"]) {
  return render(
    <ProjectMemoryProvider projectId="project-1" initialData={initialData}>
      <Consumer />
    </ProjectMemoryProvider>
  );
}

describe("ProjectMemoryProvider seed behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectMemoriesAction.mockResolvedValue({ success: true, data: [] });
    mocks.addProjectDataChangedListener.mockImplementation(() => () => {});
  });

  it("treats an explicit empty seed as loaded data without issuing an initial fetch", async () => {
    renderWithProvider([]);

    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("loading").textContent).toBe("false");

    await waitFor(() => {
      expect(mocks.getProjectMemoriesAction).not.toHaveBeenCalled();
    });
  });

  it("uses a nonempty seed without issuing an initial fetch", async () => {
    renderWithProvider([
      {
        id: "mem-1",
        projectId: "project-1",
        type: "decision",
        category: "comparison",
        statement: "Use seeded memory",
        rationale: null,
        context: null,
        importance: "normal",
        importanceRank: 10,
        status: "active",
        source: "explicit_user",
        authority: "confirmed",
        polarity: "affirming",
        confidence: 1,
        pinned: false,
        tags: [],
        version: 1,
        supersededBy: null,
        archivedAt: null,
        createdAt: new Date("2026-03-15T00:00:00.000Z"),
        updatedAt: new Date("2026-03-15T00:00:00.000Z"),
      },
    ]);

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("loading").textContent).toBe("false");

    await waitFor(() => {
      expect(mocks.getProjectMemoriesAction).not.toHaveBeenCalled();
    });
  });

  it("fetches memories when no seed is provided", async () => {
    mocks.getProjectMemoriesAction.mockResolvedValue({
      success: true,
      data: [
        {
          id: "mem-fetched",
          projectId: "project-1",
          type: "decision",
          category: "comparison",
          statement: "Fetched memory",
          rationale: null,
          context: null,
          importance: "normal",
          importanceRank: 10,
          status: "active",
          source: "explicit_user",
          authority: "confirmed",
          polarity: "affirming",
          confidence: 1,
          pinned: false,
          tags: [],
          version: 1,
          supersededBy: null,
          archivedAt: null,
          createdAt: new Date("2026-03-15T00:00:00.000Z"),
          updatedAt: new Date("2026-03-15T00:00:00.000Z"),
        },
      ],
    });

    renderWithProvider(undefined);

    await waitFor(() => {
      expect(mocks.getProjectMemoriesAction).toHaveBeenCalledWith("project-1", { status: "active" });
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("loading").textContent).toBe("false");
    });
  });
});
