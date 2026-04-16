import type { DesignLabSurfaceSlug } from "@/lib/design-lab/config";

export const designLabProject = {
  id: "design-lab-project",
  title: "Dietary Patterns and Sleep Quality",
  subtitle: "Mock project with no backend writes. Use it to test hierarchy, density, and interaction ideas.",
  phase: "Scoping review",
  status: "Ready for synthesis",
  cadence: "Weekly editorial check-in",
  owner: "Research lead",
  modified: "2 hours ago",
  reviewQuestion: "How do dietary pattern interventions affect sleep quality in adults with metabolic risk factors?",
};

export const designLabSignals = [
  { label: "Studies", value: "148", detail: "34 screened this week" },
  { label: "Included", value: "26", detail: "9 highlighted for synthesis" },
  { label: "Draft", value: "58%", detail: "Results section in progress" },
  { label: "Memory", value: "12 themes", detail: "3 new evidence clusters" },
] as const;

export const designLabWorkstreams = [
  {
    title: "Protocol",
    description: "Eligibility criteria are stable. One scope question still needs a final answer.",
    status: "Needs one decision",
    href: "/design/project/protocol",
  },
  {
    title: "Ledger",
    description: "Extraction is mostly complete. Five studies still need risk flags reviewed.",
    status: "Active",
    href: "/design/project/ledger",
  },
  {
    title: "Draft",
    description: "Introduction and methods are solid; results need tighter evidence weaving.",
    status: "In progress",
    href: "/design/project/draft",
  },
  {
    title: "Memory",
    description: "Theme clusters are rich, but one mechanism thread is still underspecified.",
    status: "Ready to prune",
    href: "/design/project/memory",
  },
] as const;

export const designLabRecentActivity = [
  { id: "a1", icon: "table_chart", time: "12 min ago", label: "Five sleep-quality outcomes were normalized in Ledger." },
  { id: "a2", icon: "smart_toy", time: "38 min ago", label: "Copilot proposed a new evidence cluster around inflammatory markers." },
  { id: "a3", icon: "edit_note", time: "1 hr ago", label: "Results section outline was tightened to three claims." },
  { id: "a4", icon: "assignment", time: "Yesterday", label: "Protocol scope note updated to exclude shift-worker-only trials." },
] as const;

export const designLabConversation = [
  {
    id: "m1",
    speaker: "user" as const,
    label: "Research lead",
    body: "Pull together the strongest cross-study signal on Mediterranean-style diets and sleep efficiency. Keep it tied to adult metabolic-risk cohorts.",
  },
  {
    id: "m2",
    speaker: "assistant" as const,
    label: "Copilot",
    body: "The cleanest signal is moderate improvement in sleep efficiency when dietary change is paired with weight-loss adherence support. The effect looks stronger in studies that tracked evening carbohydrate timing.",
    receipts: ["Reviewed 12 extracted studies", "Clustered 3 overlapping mechanisms", "Flagged 2 contradictory trials"],
  },
  {
    id: "m3",
    speaker: "artifact" as const,
    label: "Proposed evidence block",
    body: "Add a synthesis block comparing Mediterranean-pattern interventions against low-fat comparator diets, with a caveat about small trial sizes.",
  },
  {
    id: "m4",
    speaker: "user" as const,
    label: "Research lead",
    body: "Queue a follow-up for inflammatory markers after this run finishes.",
  },
] as const;

export const designLabLedgerStudies = [
  {
    id: "s1",
    title: "Mediterranean diet and objective sleep efficiency in adults with obesity",
    citation: "Rossi et al. · 2024 · Sleep Medicine",
    status: "Ready",
    signal: "Strong fit",
    notes: "Actigraphy outcome and adherence subgroup both look synthesis-worthy.",
  },
  {
    id: "s2",
    title: "Diet quality coaching for adults with metabolic syndrome",
    citation: "Nguyen et al. · 2023 · Nutrients",
    status: "Needs review",
    signal: "Mixed outcome",
    notes: "Self-reported sleep only; keep but visually downgrade until checked.",
  },
  {
    id: "s3",
    title: "Low-fat vs Mediterranean comparator trial with sleep secondary endpoints",
    citation: "Molina et al. · 2022 · Clinical Nutrition",
    status: "Extracted",
    signal: "Comparator study",
    notes: "Useful for contrast language in results and discussion.",
  },
  {
    id: "s4",
    title: "Meal timing intervention and sleep regularity in prediabetes",
    citation: "Chen et al. · 2024 · Chronobiology International",
    status: "Queued",
    signal: "Processing",
    notes: "PDF import is complete; extraction is still running.",
  },
] as const;

export const designLabDraftSections = [
  { id: "d1", label: "Introduction", state: "Ready", excerpt: "Sleep disruption and metabolic risk frequently coexist, but intervention literature is scattered across dietary patterns and adherence models." },
  { id: "d2", label: "Methods", state: "Ready", excerpt: "Eligible studies included adult cohorts with dietary intervention exposure and at least one sleep-quality outcome." },
  { id: "d3", label: "Results", state: "Active", excerpt: "Across Mediterranean-style interventions, sleep efficiency improved most consistently when adherence support remained high across the intervention window." },
  { id: "d4", label: "Discussion", state: "Needs shape", excerpt: "Mechanistic explanations still need tighter alignment between inflammatory markers, weight loss, and timing effects." },
] as const;

export const designLabProtocolBlocks = [
  {
    title: "Research question",
    body: designLabProject.reviewQuestion,
  },
  {
    title: "Include",
    bullets: [
      "Adult cohorts with metabolic risk factors or obesity",
      "Dietary pattern interventions lasting at least 4 weeks",
      "At least one subjective or objective sleep outcome",
    ],
  },
  {
    title: "Exclude",
    bullets: [
      "Shift-worker-only populations",
      "Acute meal-timing studies shorter than 7 days",
      "Studies without extractable outcome detail",
    ],
  },
] as const;

export const designLabMemoryClusters = [
  {
    title: "Adherence matters more than named diet brand",
    detail: "When adherence support is strong, sleep efficiency gains appear across more than one dietary pattern.",
    strength: "High confidence",
  },
  {
    title: "Inflammatory markers may explain part of the effect",
    detail: "CRP reductions travel with sleep improvements in several included studies, but sample sizes remain small.",
    strength: "Emerging",
  },
  {
    title: "Timing signals are promising but inconsistent",
    detail: "Evening carbohydrate timing appears useful in a subset of interventions, though definitions vary.",
    strength: "Needs review",
  },
] as const;

export const designLabNotes = [
  {
    id: "n1",
    title: "Tighten results headline",
    body: "Avoid implying all diet-quality interventions improve sleep. Keep the headline tied to adherence-supported Mediterranean-style studies.",
    kind: "Pinned",
  },
  {
    id: "n2",
    title: "Figure idea",
    body: "Matrix of intervention pattern, adherence intensity, and sleep-outcome type.",
    kind: "Sketch",
  },
  {
    id: "n3",
    title: "Question for later",
    body: "Should inflammatory markers live in results or in the opening discussion bridge?",
    kind: "Open question",
  },
] as const;

export function getDesignLabSurfaceEyebrow(surface: DesignLabSurfaceSlug): string {
  switch (surface) {
    case "conversation":
      return "Project copilot";
    case "ledger":
      return "Evidence operations";
    case "draft":
      return "Writing surface";
    case "protocol":
      return "Review protocol";
    case "memory":
      return "Knowledge memory";
    case "notes":
      return "Working notes";
    case "overview":
    default:
      return "Project workspace";
  }
}
