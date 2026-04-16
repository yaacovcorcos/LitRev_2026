"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  DESIGN_LAB_DENSITIES,
  DESIGN_LAB_STATES,
  DESIGN_LAB_SURFACES,
  DESIGN_LAB_VIEWPORTS,
  type DesignLabDensity,
  type DesignLabState,
  type DesignLabSurfaceSlug,
  type DesignLabViewport,
  sanitizeDesignLabDensity,
  sanitizeDesignLabState,
  sanitizeDesignLabViewport,
} from "@/lib/design-lab/config";
import styles from "./DesignLabShell.module.css";

type DesignLabShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  currentSurface?: DesignLabSurfaceSlug;
};

function formatChoiceLabel(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function DesignLabShell({
  title,
  description,
  children,
  currentSurface,
}: DesignLabShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const viewport = sanitizeDesignLabViewport(searchParams.get("viewport"));
  const surfaceState = sanitizeDesignLabState(searchParams.get("state"));
  const density = sanitizeDesignLabDensity(searchParams.get("density"));

  const sharedSearch = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (viewport === "desktop") {
      params.delete("viewport");
    } else {
      params.set("viewport", viewport);
    }
    if (surfaceState === "default") {
      params.delete("state");
    } else {
      params.set("state", surfaceState);
    }
    if (density === "comfortable") {
      params.delete("density");
    } else {
      params.set("density", density);
    }
    return params;
  }, [density, searchParams, surfaceState, viewport]);

  const buildHref = (targetPath: string, overrides?: Partial<{
    viewport: DesignLabViewport;
    state: DesignLabState;
    density: DesignLabDensity;
  }>) => {
    const params = new URLSearchParams(sharedSearch.toString());

    if (overrides?.viewport) {
      if (overrides.viewport === "desktop") {
        params.delete("viewport");
      } else {
        params.set("viewport", overrides.viewport);
      }
    }

    if (overrides?.state) {
      if (overrides.state === "default") {
        params.delete("state");
      } else {
        params.set("state", overrides.state);
      }
    }

    if (overrides?.density) {
      if (overrides.density === "comfortable") {
        params.delete("density");
      } else {
        params.set("density", overrides.density);
      }
    }

    const query = params.toString();
    return query.length > 0 ? `${targetPath}?${query}` : targetPath;
  };

  const handleToggle = (
    key: "viewport" | "state" | "density",
    value: DesignLabViewport | DesignLabState | DesignLabDensity,
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    if ((key === "viewport" && value === "desktop") ||
      (key === "state" && value === "default") ||
      (key === "density" && value === "comfortable")) {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    startTransition(() => {
      router.replace(query.length > 0 ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  };

  const handleCopy = async () => {
    if (typeof window === "undefined" || !navigator.clipboard) {
      setCopied("Copy unavailable");
      return;
    }

    const href = buildHref(pathname);
    await navigator.clipboard.writeText(`${window.location.origin}${href}`);
    setCopied("Link copied");
  };

  return (
    <AppShell
      activeNav="projects"
      noMainPadding
      mainClassName={styles.main}
      skipAdminStatusCheck
      skipUserMenu
    >
      <div className="surface-root" data-surface-height="shell">
        <div className={`surface-scroll-body ${styles.scrollBody}`} data-surface-padding="responsive">
          <div className={styles.header}>
            <div className={styles.headerCopy}>
              <p className={styles.eyebrow}>Design Lab</p>
              <h1 className={styles.title}>{title}</h1>
              <p className={styles.description}>{description}</p>
            </div>
            <div className={styles.headerActions}>
              <Link href="/design" className={styles.secondaryAction}>
                Surface index
              </Link>
              <button type="button" className={styles.primaryAction} onClick={handleCopy}>
                Copy current view
              </button>
              {copied ? <p className={styles.copyStatus}>{copied}</p> : null}
            </div>
          </div>

          <div className={styles.workspace}>
            <aside className={styles.sidebar}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span className="material-icons-round" aria-hidden="true">dashboard_customize</span>
                  <div>
                    <h2 className={styles.panelTitle}>Surface map</h2>
                    <p className={styles.panelCopy}>Jump between the major redesign targets.</p>
                  </div>
                </div>
                <nav className={styles.surfaceNav} aria-label="Design lab surfaces">
                  {DESIGN_LAB_SURFACES.map((surface) => (
                    <Link
                      key={surface.slug}
                      href={buildHref(`/design/project/${surface.slug}`)}
                      className={`${styles.surfaceLink} ${currentSurface === surface.slug ? styles.surfaceLinkActive : ""}`}
                    >
                      <span className={styles.surfaceKicker}>{surface.kicker}</span>
                      <span className={styles.surfaceTitle}>{surface.title}</span>
                      <span className={styles.surfaceSummary}>{surface.summary}</span>
                    </Link>
                  ))}
                </nav>
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span className="material-icons-round" aria-hidden="true">tune</span>
                  <div>
                    <h2 className={styles.panelTitle}>Scenario controls</h2>
                    <p className={styles.panelCopy}>All controls are URL-based so a state can be shared and reopened.</p>
                  </div>
                </div>

                <ChoiceGroup
                  label="Viewport"
                  values={DESIGN_LAB_VIEWPORTS}
                  selected={viewport}
                  pending={isPending}
                  onSelect={(value) => handleToggle("viewport", value)}
                />

                <ChoiceGroup
                  label="Surface state"
                  values={DESIGN_LAB_STATES}
                  selected={surfaceState}
                  pending={isPending}
                  onSelect={(value) => handleToggle("state", value)}
                />

                <ChoiceGroup
                  label="Density"
                  values={DESIGN_LAB_DENSITIES}
                  selected={density}
                  pending={isPending}
                  onSelect={(value) => handleToggle("density", value)}
                />
              </section>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span className="material-icons-round" aria-hidden="true">edit_square</span>
                  <div>
                    <h2 className={styles.panelTitle}>Editing entry points</h2>
                    <p className={styles.panelCopy}>The lab is intentionally easy to reshape.</p>
                  </div>
                </div>
                <ul className={styles.editList}>
                  <li><code>next-app/lib/design-lab/fixtures.ts</code> for scenario data</li>
                  <li><code>next-app/components/design-lab/DesignLabProjectSurface.tsx</code> for surface markup</li>
                  <li><code>next-app/components/design-lab/DesignLabShell.module.css</code> for the studio chrome</li>
                </ul>
              </section>
            </aside>

            <section className={styles.canvasColumn}>
              {children}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ChoiceGroup<T extends readonly string[]>({
  label,
  values,
  selected,
  pending,
  onSelect,
}: {
  label: string;
  values: T;
  selected: T[number];
  pending: boolean;
  onSelect: (value: T[number]) => void;
}) {
  return (
    <div className={styles.choiceGroup}>
      <p className={styles.choiceLabel}>{label}</p>
      <div className={styles.choiceRow} role="group" aria-label={label}>
        {values.map((value) => (
          <button
            key={value}
            type="button"
            disabled={pending}
            className={`${styles.choiceButton} ${selected === value ? styles.choiceButtonActive : ""}`}
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
          >
            {formatChoiceLabel(value)}
          </button>
        ))}
      </div>
    </div>
  );
}
