"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DESIGN_LAB_SURFACES } from "@/lib/design-lab/config";
import styles from "./DesignLabProjectSurface.module.css";

export function DesignLabIndexContent() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const suffix = query.length > 0 ? `?${query}` : "";

  return (
    <div className={styles.indexGrid}>
      {DESIGN_LAB_SURFACES.map((surface) => (
        <Link key={surface.slug} href={`/design/project/${surface.slug}${suffix}`} className={styles.indexCard}>
          <span className={styles.indexKicker}>{surface.kicker}</span>
          <h2 className={styles.indexTitle}>{surface.title}</h2>
          <p className={styles.indexBody}>{surface.summary}</p>
          <span className={styles.indexAction}>Open surface</span>
        </Link>
      ))}
    </div>
  );
}
