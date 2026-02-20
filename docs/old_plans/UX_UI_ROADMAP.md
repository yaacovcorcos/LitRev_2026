# [ARCHIVED]
> **Note:** This file is obsolete. Active plans have moved to `docs/plans/README.md`.

# UX/UI Roadmap

Tracked ideas for chat interface and agent UX improvements.
Sources: Open WebUI, LibreChat, Vercel AI Chatbot, Lobe Chat, HuggingFace Chat UI, Chatbot UI, Codex recommendations.
OSS code targets to adapt (MIT/Apache-2.0 unless noted): `assistant-ui`, `assistant-ui/tool-ui`, `vercel/ai-elements`, `stackblitz-labs/use-stick-to-bottom`, `rehype-pretty/rehype-pretty-code`, `cmdk`, `react-virtuoso`, `@radix-ui/primitives`, `sonner`, `axe-core`, `@tanstack/virtual`.
Library decisions: **Radix Primitives** for Dialog/Popover/Menu/Listbox (pairs with CSS Modules, unstyled). **Sonner** for toasts. **TanStack Virtual** for virtualization (headless). **axe-core** for CI a11y regression. Vaul deferred (unmaintained); mobile drawer will use Radix Dialog + custom drag if needed.

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
- [x] **Centered input on empty state** — Input + empty state vertically centered when no messages, shifts to bottom-input layout when conversation starts. `flex: 0 1 auto` + `justify-content: center` pattern. Applied to both conversation mode and AI page, copilot panel excluded via `variant` gating. *(ConversationMainView.tsx/css, ai/page.tsx, ai-view.module.css, TimelineRenderer.tsx, ProjectCopilot.module.css)*
- [x] **2-column suggestion grid, state-aware** — 2×2 card grid with icon, title, and computed description. Descriptions include dynamic counts from `ProjectStateSnapshot` (e.g., "Review 12 titles and abstracts against your protocol"). `key={chip.prompt}` for stability, `aria-hidden` on icons, `:focus-visible` outlines, `prefers-reduced-motion` support. Responsive 1-column at ≤480px. *(SuggestionChips.tsx/css, suggestions.ts, suggestions.test.ts, ConversationMainView.tsx, useProjectState.ts)*

---

## Planned

### P0 — Correctness & Trust (ship before new UI features)

These are bugs and trust-eroding issues. Fix before adding features.

- [ ] **Fix route/layout composition for project pages** — `app/project/[id]/layout.tsx` wraps children in AppShell + ProjectShell, but `memory/page.tsx` and `ledger/[studyId]/page.tsx` render their own AppShell, causing double sidebars/headers. Fix: create route groups `(shell)/` and `(standalone)/` under `app/project/[id]/`, or make all pages true shell children that only render inner content. *(app/project/[id]/layout.tsx, memory/page.tsx, ledger/[studyId]/page.tsx)*
- [x] **Fix nested interactive elements** — Refactored AI history items from nested `<button>` to sibling buttons (`historySelectBtn` + `deleteBtn`) inside a `<div>` wrapper. `aria-pressed` replaced with `aria-current="true"`. *(app/ai/page.tsx, ai-view.module.css)*
- [ ] **Define missing CSS tokens + add `.btn-danger`** — `--bg-secondary`, `--bg-tertiary`, `--border-default` used but never declared (fall through to transparent/0). Add semantic tokens for surfaces, borders, status colors (danger/info/success). Add `.btn-danger` for destructive actions. Acceptance: no undefined `var(--*)` references; destructive buttons visually distinct. *(global styles, study detail pages)*
- [ ] **Make listbox/menu/option UIs keyboard-correct** — Conversation selectors use `div role="option"` without keyboard support. Acceptance: Tab into list, ArrowUp/Down changes option, Enter selects, Escape closes. Migrate to Radix Select/Listbox. *(ConversationMainView dropdown, any role="option" patterns)*
- [ ] **Restore visible focus states everywhere** — Multiple components do `outline: none` without replacement. Acceptance: every interactive element has a visible `:focus-visible` indicator. *(global audit — search for `outline: none` or `outline: 0`)*
- [x] **Remove or implement placebo UI** — Removed non-functional search bar from dashboard `ControlsBar.tsx` (CSS kept — shared with Library page's functional search). Fixed mobile nav: "Settings" → "Library" with correct `bookmarks` icon. *(components/ControlsBar.tsx, data/navLinks.ts)*
- [ ] **Add `axe-core` to CI** — Automated a11y regression tests. Run against key pages (project overview, AI chat, study detail). Catches nested-button type issues before they ship. *(vitest setup or playwright config)*

### P1 — Consistency & Primitives (reduce bespoke JS + CSS drift)

- [ ] **Standardize overlays on Radix Primitives** — Replace hand-rolled modals, dropdowns, and popovers with Radix Dialog/Popover/DropdownMenu. One pattern for all overlay UI. *(Modal.tsx, command palette, conversation dropdown, autonomy settings)*
- [ ] **Standardize menu/listbox patterns** — One Radix-based pattern for all selectors (conversation picker, study sort, model picker). Keyboard-correct by default. *(ConversationMainView, ControlsBar, CopilotInput)*
- [ ] **Semantic token pass + palette drift removal** — Eliminate hard-coded blue/purple accents (`rgba(129, 140, 248, …)`, `#818CF8`) that conflict with terracotta/sage theme. Define complete token set: `--color-danger`, `--color-info`, `--color-success`, `--surface-*`, `--border-*`, `--focus-ring`. Acceptance: no undefined CSS vars, no hard-coded accent hex outside token definitions. *(global styles, component CSS modules)*
- [ ] **Non-blocking composer while streaming** — Keep input editable while agent responds. Support "Stop" + "Send anyway" (interrupt) or queued-next-message. *(CopilotInput, Conversation composer)* Borrow from: ChatGPT/LibreChat composer behavior; `assistant-ui` composer patterns.

### P2 — Feature Tiers (additive UX improvements)

#### Tier A — High Trust Multipliers

- [ ] **Tool receipt blocks per assistant turn** — Compact expandable line: `Used: PubMed search · 47 results · 2.1s · Context: protocol + 7 memories`. Highest trust multiplier for agentic behavior. Pairs with RunEvent system + context_assembly data. *(TimelineRenderer, new ToolReceipt component)* Borrow from: `assistant-ui` tool-call rendering + "thinking steps" UI; `vercel/ai-elements` `tool`/`sources` components.
- [ ] **Inline approve/apply/undo on artifacts** — Apply button on protocol/draft suggestions + global "Undo last" toast (Sonner). Critical safety affordance for autonomous mode. *(new artifact review component)* Borrow from: `assistant-ui/tool-ui` "human approval"/decision prompt patterns.
- [ ] **Error + retry/resume affordance** — Visible error state for tool failures / stream disconnects with "Retry last step" / "Resume run" buttons. Dominates perceived reliability. *(TimelineRenderer error items, new component)* Borrow from: `assistant-ui` retryable tool-call UI patterns.
- [ ] **Autonomy preset behavior contract** — When switching Manual/Assisted/Auto, show one-line contract ("Reads auto, writes propose") + visible badge. *(CopilotInput autonomy selector)*
- [ ] **Context chips above composer** — Show what AI sees: `Protocol`, `Ledger (42)`, `Draft: Methods`. Let users pin/unpin context. **Caveat**: only ship if pin/unpin actually affects server-side context assembly, otherwise it reduces trust. *(CopilotInput)* Borrow from: `vercel/ai-elements` context chips.

#### Tier B — Domain-Defining Features

- [ ] **Sources panel** — Side panel opened via study IDs / ledger links from AI responses. Shows abstract, PMID, PDF excerpt, inclusion status. *(new component)* Borrow from: `vercel/ai-elements` `sources` patterns; Open WebUI citations panel.
- [ ] **Inline citation chips** — `[Smith 2024]` chips in AI responses that link to sources panel. Requires robust mapping from text mentions to ledger studies. Ship after sources panel. *(TimelineRenderer markdown config)*
- [ ] **Conversation list date grouping** — "Today / Yesterday / Last 7 days / Older" in conversation dropdown. Cursor-based pagination. *(ConversationMainView dropdown)* Borrow from: LibreChat / Chatbot UI.

#### Tier C — Polish & Scale

- [ ] **Toast system (Sonner)** — Replace ad-hoc inline "Saved!" / "Copied!" states with consistent toast notifications. Also used for error/retry and undo confirmations. *(global, replaces chatActionsVisible pattern)*
- [ ] **Unify `/ai` chat UI with project conversation** — Shared message list, composer, receipts/errors between standalone AI page and project conversation mode. Reduce duplicate rendering logic. *(app/ai/page.tsx, ConversationMainView.tsx, TimelineRenderer.tsx)*
- [ ] **Virtualize long lists** — Ledger tables, chat histories, conversation lists. Use TanStack Virtual (headless, keeps markup). Ship when data volume justifies it. *(EvidenceLedger, TimelineRenderer, ConversationMainView)*
- [ ] **Entrance animation on newest message** — Fade-in on latest message only. Never animate history loads. *(TimelineRenderer)*
- [ ] **Mobile sidebar drawer** — 85% width slide-in, auto-close on navigate. Use Radix Dialog + custom drag (not Vaul — unmaintained). *(AppShell, Sidebar)*
- [ ] **Context/prompt inspector drawer** — Debug panel showing injected context, token estimates, "why included" receipts. Behind a flag. *(new component)*

---

## Not Planned

- **Dark mode** — Requires full design token overhaul (`var()` everywhere). Deferred indefinitely.
- **Fork from here / branching** — Low value for research workflows.
- **Docked resizable input panel** (Lobe Chat style) — Too heavy for this app.
- **Time-based greeting** — "Good morning, Yaacov" — secondary to state-aware suggestions for a research tool.
- **Floating UI** — Not needed if standardizing on Radix Primitives (handles positioning internally).
