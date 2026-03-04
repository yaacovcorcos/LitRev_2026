import { AppShell } from "@/components/AppShell";
import {
  PlatformAdminAccessError,
  requirePlatformAdmin,
} from "@/lib/server/auth/platform-admin";
import { notFound } from "next/navigation";
import Link from "next/link";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      notFound();
    }
    throw error;
  }

  return (
    <AppShell activeNav="admin" forceAdminNav>
      <section className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Platform Admin</p>
          <h1 className={styles.title}>Admin Console</h1>
          <p className={styles.description}>
            Platform admin control plane for user access and usage analytics.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href="/admin/users">
              Open Users Directory
            </Link>
            <Link className={styles.primaryLink} href="/admin/usage">
              Open Usage Analytics
            </Link>
          </div>
        </header>
      </section>
    </AppShell>
  );
}
