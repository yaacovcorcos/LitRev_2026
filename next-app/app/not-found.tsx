import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <AppShell activeNav="projects">
      <EmptyState
        variant="warning"
        icon="travel_explore"
        title="Page not found"
        description="The LitRev page you requested does not exist or is no longer available."
        primaryAction={{ label: "Back to workspace", href: "/" }}
      />
    </AppShell>
  );
}
