# UX/UI Roadmap

Tracked ideas for chat interface and agent UX improvements.
Sources: Open WebUI, LibreChat, Vercel AI Chatbot, Lobe Chat, HuggingFace Chat UI, Chatbot UI, Codex recommendations.
OSS code targets to adapt (MIT/Apache-2.0 unless noted): `assistant-ui`, `assistant-ui/tool-ui`, `vercel/ai-elements`, `stackblitz-labs/use-stick-to-bottom`, `rehype-pretty/rehype-pretty-code`, `cmdk`, `vaul`, `react-virtuoso`.

---

## Completed

- [x] **Floating pill input** — Translucent glassmorphic input with `backdrop-filter: blur`, `border-radius: 24px`, soft shadow, no divider line. Applied to both copilot panel and AI page. *(ProjectCopilot.module.css, ai-view.module.css)*
- [x] **Unified collapse buttons** — All side panels (Sidebar, Chat History, Copilot, Evidence Ledger) use `menu_open` rotating icon pattern. *(ProjectCopilot.tsx/css, draft page)*
- [x] **Round send button** — `border-radius: 50%` on send buttons in both input boxes.
- [x] **Staggered chip animation** — `@keyframes fadeInUp` with `50ms * index` delay on suggestion chips + empty-state suggestChips. Respects `prefers-reduced-motion`. *(SuggestionChips.tsx/css, ProjectCopilot.module.css)*
- [x] **Streaming cursor** — CSS `::after` blinking cursor on last AI message while streaming tokens. Only active when `isLoading && last timeline item is assistant_message` (not during tool execution). Dots = thinking, cursor = writing. *(ProjectCopilot.module.css, TimelineRenderer.tsx)*
- [x] **Scroll-to-bottom FAB** — Sticky floating button appears when scrolled up (80px threshold). Smooth-scrolls to bottom on click. Glassmorphic style. *(TimelineRenderer.tsx, ProjectCopilot.module.css)* Borrow from: `stackblitz-labs/use-stick-to-bottom` scroll state + button pattern (UX similar to Vercel AI Chatbot).
- [x] **Message hover actions** — Icon-only action buttons (copy, save, insert) hidden by default, revealed on hover with 0.15s fade. `chatActionsVisible` keeps "Saved!" confirmation visible. Keyboard `:focus-within` and `@media (hover: none)` touch fallback. *(ProjectCopilot.module.css, TimelineRenderer.tsx)*
- [x] **Code block copy + language label** — Header bar on fenced code blocks with language name + copy button. Domain-specific: "Copy query" for PubMed strings. Case-insensitive lang normalization, `c++`/`objective-c` support. Shared `markdownComponents` used by both copilot panel and AI page. *(components/markdown/CodeBlock.tsx, styles/markdown.module.css, TimelineRenderer.tsx, app/ai/page.tsx)*
- [x] **Full-width messages in conversation mode** — `variant="page"` prop on TimelineRenderer applies `.pageLayout` CSS overrides: no bubbles, full-width messages, user messages get left accent bar + subtle coral tint, AI messages are transparent full-width. Copilot side panel unchanged (`variant="panel"` default). *(TimelineRenderer.tsx, ProjectCopilot.module.css, ConversationMainView.tsx)*

---

## Planned

### Tier 1 — Next Up (easy, additive, zero breakage risk)

- [ ] **2-column suggestion grid, state-aware** — Bigger cards reflecting project state ("Protocol missing — define PICO", "12 unscreened studies"). Mostly CSS + mapping to existing `getSuggestions(snapshot)`. *(SuggestionChips, ConversationMainView)* Borrow from: `vercel/ai-elements` suggestion patterns; `assistant-ui` message composer suggestion UI; Vercel AI Chatbot grid layout.
- [ ] **Non-blocking composer while streaming** — Keep the input editable while the agent is responding (don’t lock the textbox). Optionally support "Stop" + "Send anyway" (interrupt) or a queued-next-message UX. *(CopilotInput, Conversation composer)* Borrow from: ChatGPT/LibreChat composer behavior; `assistant-ui` composer patterns.

### Tier 2 — Strong Follow-ups

- [ ] **Tool receipt blocks per assistant turn** — Compact expandable line: `Used: PubMed search · 47 results · 2.1s · Context: protocol + 7 memories`. Highest trust multiplier for agentic behavior. Pairs with RunEvent system + context_assembly data. *(TimelineRenderer, new ToolReceipt component)* Borrow from: `assistant-ui` tool-call rendering + “thinking steps” UI; `vercel/ai-elements` `tool`/`sources` components (receipt row + expand).
- [ ] **Inline approve/apply/undo on artifacts** — Apply button on protocol/draft suggestions + global "Undo last" toast. Critical safety affordance for autonomous mode. *(new artifact review component)* Borrow from: `assistant-ui/tool-ui` “human approval”/decision prompt patterns; LibreChat-style toasts.
- [ ] **Error + retry/resume affordance** — Visible error state for tool failures / stream disconnects with "Retry last step" / "Resume run" buttons. Dominates perceived reliability more than animations. *(TimelineRenderer error items, new component)* Borrow from: `assistant-ui` retryable tool-call UI patterns; Chatbot UI error rows.
- [ ] **Autonomy preset behavior contract** — When switching Manual/Assisted/Auto, show one-line contract ("Reads auto, writes propose") + visible badge. *(CopilotInput autonomy selector)* Borrow from: `assistant-ui`/Chatbot UI “mode badges” pattern (simple banner + iconography).
- [ ] **Context chips above composer** — Show what AI sees: `Protocol`, `Ledger (42)`, `Draft: Methods`. Let users pin/unpin context. **Caveat**: only ship if pin/unpin actually affects server-side context assembly, otherwise it reduces trust. *(CopilotInput)* Borrow from: `vercel/ai-elements` context chips; Open WebUI “context items” UX.

### Tier 3 — Domain-Defining Features

- [ ] **Sources panel** — Side panel opened via known study IDs / ledger links from AI responses. Shows abstract, PMID, PDF excerpt, inclusion status. Ship first as standalone component. *(new component)* Borrow from: `vercel/ai-elements` `sources` patterns; Open WebUI citations/sources panel UX; optionally use `react-virtuoso` for long source lists.
- [ ] **Inline citation chips** — `[Smith 2024]` chips in AI responses that link to sources panel. Requires robust mapping from text mentions to ledger studies. Ship after sources panel. *(TimelineRenderer markdown config)* Borrow from: `vercel/ai-elements` `inline-citation` patterns; Open WebUI inline citation UX.
- [ ] **Conversation list date grouping** — "Today / Yesterday / Last 7 days / Older" in conversation dropdown. Cursor-based pagination. *(ConversationMainView dropdown)* Borrow from: LibreChat / Chatbot UI conversation list grouping.

### Tier 4 — Polish & Scale

- [ ] **Entrance animation on newest message** — Fade-in on latest message only. Never animate history loads. *(TimelineRenderer)* Borrow from: `tailwindcss-animate` utilities or copy the keyframes approach (no dependency required).
- [ ] **Time-based greeting** — "Good morning, Yaacov" — but secondary to state-aware suggestions which are more useful for a research tool.
- [ ] **Mobile sidebar drawer** — 85% width slide-in with spring physics, auto-close on navigate. *(AppShell, Sidebar)* Borrow from: `vaul` (Radix-based drawer), plus overlay/drag-to-close patterns.
- [ ] **Context/prompt inspector drawer** — Debug panel showing injected context, token estimates, "why included" receipts. Behind a flag. *(new component)*

---

## Not Planned

- **Dark mode** — Requires full design token overhaul (`var()` everywhere). Deferred indefinitely.
- **Fork from here / branching** — Low value for research workflows.
- **Docked resizable input panel** (Lobe Chat style) — Too heavy for this app.
