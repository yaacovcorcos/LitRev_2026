 // @vitest-environment jsdom
 import { act, renderHook } from "@testing-library/react";
 import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
 import { ProjectCopilotProvider, useProjectCopilot } from "../ProjectCopilotContext";
 import type { ReactNode } from "react";
 
 // Mock all external dependencies
 vi.mock("next/navigation", () => ({
     useRouter: () => ({
         push: vi.fn(),
         replace: vi.fn(),
         prefetch: vi.fn(),
     }),
 }));
 
 vi.mock("@/lib/projectCopilotStorage", () => ({
     loadProjectCopilotState: () => ({
         messages: [],
         panel: { collapsed: false, width: 400 },
     }),
     saveProjectCopilotState: vi.fn(),
     createDefaultProjectCopilotState: () => ({
         messages: [],
         panel: { collapsed: false, width: 400 },
     }),
 }));
 
 vi.mock("@/app/actions/files", () => ({
     uploadChatAttachmentAction: vi.fn(),
     extractTextFromExistingFileAction: vi.fn(),
 }));
 
 vi.mock("@/app/actions/agent", () => ({
     getAutonomyConfigAction: vi.fn(async () => ({
         success: true,
         config: { preset: "assisted", toolOverrides: {} },
     })),
     updateAutonomyAction: vi.fn(),
 }));
 
 vi.mock("@/hooks/useCopilotConversations", () => ({
     useCopilotConversations: () => ({
         conversations: [],
         currentConversationId: null,
         isLoadingConversations: false,
         showConversationList: false,
         toggleConversationList: vi.fn(),
         selectConversation: vi.fn(),
         newConversation: vi.fn(),
         renameConversation: vi.fn(),
         deleteConversation: vi.fn(),
         branchConversation: vi.fn(),
         loadConversations: vi.fn(),
         setStudyFilter: vi.fn(),
         setCurrentConversationId: vi.fn(),
         summarizeAndRefresh: vi.fn(),
         isSummarizing: false,
         isConversationLoading: false,
         hasMore: false,
         isLoadingOlder: false,
         loadOlderMessages: vi.fn(),
     }),
 }));
 
 vi.mock("@/hooks/useCopilotStreamActions", () => ({
     useCopilotStreamActions: () => ({
         sendMessage: vi.fn(),
         cancelStream: vi.fn(),
         handleReviewArtifact: vi.fn(),
         approveArtifactsBatch: vi.fn(),
         executePlan: vi.fn(),
     }),
 }));
 
 vi.mock("@/lib/ai/reasoning-visibility", () => ({
     getReasoningModePreference: () => "full",
     setReasoningModePreference: vi.fn(),
 }));
 
 function wrapper({ children }: { children: ReactNode }) {
     return (
         <ProjectCopilotProvider projectId="test-project">
             {children}
         </ProjectCopilotProvider>
     );
 }
 
 describe("Reasoning mode reset on model switch", () => {
     beforeEach(() => {
         // Clear localStorage before each test
         window.localStorage.clear();
     });
 
     afterEach(() => {
         vi.clearAllMocks();
     });
 
     it("forces reasoning mode to off when switching to a none-support model", async () => {
         const { result } = renderHook(() => useProjectCopilot(), { wrapper });
 
         // Initial state: claude model (explicit support), full reasoning mode
         expect(result.current.reasoningMode).toBe("full");
 
         // Switch to gpt-5-mini (none support)
         await act(async () => {
             result.current.setSelectedModel("gpt-5-mini");
         });
 
         expect(result.current.selectedModel).toBe("gpt-5-mini");
         expect(result.current.reasoningSupport).toBe("none");
         expect(result.current.reasoningMode).toBe("off");
     });
 
     it("preserves reasoning mode when switching to an explicit-support model", async () => {
         const { result } = renderHook(() => useProjectCopilot(), { wrapper });
 
         // Set reasoning mode to summary first
         await act(async () => {
             result.current.setReasoningMode("summary");
         });
 
         // Switch to claude (explicit support)
         await act(async () => {
             result.current.setSelectedModel("claude-haiku-4-5");
         });
 
         expect(result.current.selectedModel).toBe("claude-haiku-4-5");
         expect(result.current.reasoningSupport).toBe("explicit");
         expect(result.current.reasoningMode).toBe("summary");
     });
 
     it("preserves reasoning mode when switching to a best_effort model", async () => {
         const { result } = renderHook(() => useProjectCopilot(), { wrapper });
 
         // Switch to grok (best_effort support)
         await act(async () => {
             result.current.setSelectedModel("grok-4-1-fast");
         });
 
         expect(result.current.selectedModel).toBe("grok-4-1-fast");
         expect(result.current.reasoningSupport).toBe("best_effort");
         expect(result.current.reasoningMode).toBe("full");
     });
 
     it("returns correct reasoningSupport tier for each model", async () => {
         const { result } = renderHook(() => useProjectCopilot(), { wrapper });
 
         await act(async () => {
             result.current.setSelectedModel("claude-haiku-4-5");
         });
         expect(result.current.reasoningSupport).toBe("explicit");
 
         await act(async () => {
             result.current.setSelectedModel("gpt-5.2");
         });
         expect(result.current.reasoningSupport).toBe("best_effort");
 
         await act(async () => {
             result.current.setSelectedModel("gemini-3-flash-preview");
         });
         expect(result.current.reasoningSupport).toBe("none");
     });
 });
