/**
 * Custom hook encapsulating draft copilot chat logic
 * for the Draft Studio page. Extracted from page.tsx (D-5).
 */
import { useEffect, useRef, useState } from "react";
import { CopilotMessage, DraftState } from "@/lib/draft-storage";
import type { Editor } from "@tiptap/react";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

type UseDraftCopilotDeps = {
  draft: DraftState;
  activeSectionLabel: string;
  projectName: string | undefined;
  updateDraft: (updater: (prev: DraftState) => DraftState) => void;
  activeEditorRef: React.MutableRefObject<Editor | null>;
};

export function useDraftCopilot(deps: UseDraftCopilotDeps) {
  const { draft, activeSectionLabel, projectName, updateDraft, activeEditorRef } = deps;

  const [copilotInput, setProjectConversationComposer] = useState("");
  const copilotListRef = useRef<HTMLDivElement | null>(null);
  const copilotAutoScrollRef = useRef(true);

  const buildCopilotResponse = (text: string) => {
    const lower = text.toLowerCase();
    const section = activeSectionLabel;
    const name = projectName ?? "this project";

    if (lower.includes("outline")) {
      return `Here's a concise outline for the ${section} section of ${name}:\n\n- Key point 1\n- Key point 2\n- Key point 3\n\nWant this tailored to a specific study type (RCT, cohort, systematic review)?`;
    }
    if (lower.includes("rewrite")) {
      return `Paste the paragraph you want rewritten for ${section}. I can tighten clarity, improve flow, and keep it medically appropriate.`;
    }
    if (lower.includes("methods")) {
      return `For ${section}, we can structure this as: design, data sources, eligibility, outcomes, statistical analysis, and ethics. Tell me your study design and population.`;
    }
    return `Got it — I'll help with ${section}. Tell me what you want to achieve in this section (claim, comparison, or summary), and I'll draft a clean version.`;
  };

  const handleCopilotSend = async () => {
    const text = copilotInput.trim();
    if (!text) return;
    copilotAutoScrollRef.current = true;
    const now = new Date().toISOString();
    const userMsg: CopilotMessage = { id: `u-${Date.now()}`, sender: "user", text, createdAt: now };

    const targetSectionId = draft.activeSection ?? UNSECTIONED_DRAFT_ID;
    updateDraft((prev) => {
      const list = prev.copilotBySection[targetSectionId] ?? [];
      return {
        ...prev,
        copilotBySection: {
          ...prev.copilotBySection,
          [targetSectionId]: [...list, userMsg],
        },
      };
    });
    setProjectConversationComposer("");

    const aiText = buildCopilotResponse(text);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const aiMsg: CopilotMessage = { id: `a-${Date.now()}`, sender: "ai", text: aiText, createdAt: new Date().toISOString() };
    updateDraft((prev) => {
      const list = prev.copilotBySection[targetSectionId] ?? [];
      return {
        ...prev,
        copilotBySection: {
          ...prev.copilotBySection,
          [targetSectionId]: [...list, aiMsg],
        },
      };
    });
  };

  useEffect(() => {
    copilotAutoScrollRef.current = true;
  }, [draft.activeSection]);

  useEffect(() => {
    if (!copilotListRef.current) return;
    if (!copilotAutoScrollRef.current) return;
    copilotListRef.current.scrollTop = copilotListRef.current.scrollHeight;
  }, [draft.activeSection, draft.copilotBySection]);

  const handleCopilotScroll = () => {
    if (!copilotListRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = copilotListRef.current;
    copilotAutoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 80;
  };

  const insertCopilotText = (text: string) => {
    const editor = activeEditorRef.current;
    if (!editor) return;
    editor.chain().focus().insertContent(text).run();
  };

  return {
    copilotInput,
    setProjectConversationComposer,
    copilotListRef,
    copilotAutoScrollRef,
    handleCopilotSend,
    handleCopilotScroll,
    insertCopilotText,
  };
}
