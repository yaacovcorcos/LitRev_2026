import { DesignLabIndexContent } from "@/components/design-lab/DesignLabIndexContent";
import { DesignLabShell } from "@/components/design-lab/DesignLabShell";

export default function DesignLabIndexPage() {
  return (
    <DesignLabShell
      title="Frontend-only design sandbox"
      description="Use this studio to redesign LitRev’s major workflows without touching the backend. Every surface is fixture-driven, shareable by URL, and intentionally easy to reshape."
    >
      <DesignLabIndexContent />
    </DesignLabShell>
  );
}
