import { ProjectDetailClient } from "./ProjectDetailClient";
import { getProjectOverviewStatsAction, type ProjectOverviewStats } from "@/app/actions/stats";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let initialOverviewStats: ProjectOverviewStats | null = null;

  if (id) {
    const result = await getProjectOverviewStatsAction(id);
    if (result.success) {
      initialOverviewStats = result.data;
    }
  }

  return (
    <ProjectDetailClient
      key={id}
      projectId={id}
      initialOverviewStats={initialOverviewStats}
    />
  );
}
