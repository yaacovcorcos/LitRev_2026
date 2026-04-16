import { notFound } from "next/navigation";
import { DesignLabProjectSurface } from "@/components/design-lab/DesignLabProjectSurface";
import { DesignLabShell } from "@/components/design-lab/DesignLabShell";
import { DESIGN_LAB_SURFACES, getDesignLabSurface } from "@/lib/design-lab/config";

export function generateStaticParams() {
  return DESIGN_LAB_SURFACES.map((surface) => ({ surface: surface.slug }));
}

export default async function DesignProjectSurfacePage({
  params,
}: {
  params: Promise<{ surface: string }>;
}) {
  const { surface: surfaceSlug } = await params;
  const surface = getDesignLabSurface(surfaceSlug);

  if (!surface) {
    notFound();
  }

  return (
    <DesignLabShell
      title={surface.title}
      description={surface.summary}
      currentSurface={surface.slug}
    >
      <DesignLabProjectSurface surface={surface.slug} />
    </DesignLabShell>
  );
}
