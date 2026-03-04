import { AppShell } from "@/components/AppShell";
import {
  PlatformAdminAccessError,
  requirePlatformAdmin,
} from "@/lib/server/auth/platform-admin";
import { forbidden } from "next/navigation";
import Link from "next/link";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      forbidden();
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
            Admin foundation is active. User management and analytics modules are staged in later phases.
          </p>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href="/admin/users">
              Open Users Directory
            </Link>
          </div>
        </header>
      </section>
    </AppShell>
  );
}
