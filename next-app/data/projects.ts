import { Project } from "@/types/project";

export const defaultProjects: Project[] = [
  {
    id: "p1",
    name: "Machine Learning in Radiopathology 2020-2025",
    status: "harvesting",
    statusText: "Status: Harvesting papers...",
    progress: { phase: "Phase 2 of 4: Deduplicating", percent: 45, papers: 27 },
    modified: "2025-11-24T14:00:00",
    created: "2025-11-20",
  },
  {
    id: "p2",
    name: "Climate Change Adaptation Strategies in Urban Planning",
    status: "ready",
    statusText: "Status: Review Ready",
    papers: 154,
    modified: "2025-11-23T10:00:00",
    created: "2025-11-15",
  },
  {
    id: "p3",
    name: "CRISPR Applications in Neurodegenerative Diseases",
    status: "ready",
    statusText: "Status: Review Ready",
    papers: 89,
    modified: "2025-11-22T16:30:00",
    created: "2025-11-18",
  },
  {
    id: "p4",
    name: "Sustainable Supply Chain Management in Fashion",
    status: "ready",
    statusText: "Status: Review Ready",
    papers: 210,
    modified: "2025-11-21T09:15:00",
    created: "2025-11-10",
  },
  {
    id: "p5",
    name: "Impact of Remote Work on Employee Productivity",
    status: "ready",
    statusText: "Status: Review Ready",
    papers: 132,
    modified: "2025-11-19T14:45:00",
    created: "2025-11-05",
  },
];
