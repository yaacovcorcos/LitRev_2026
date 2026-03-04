import { AppShell } from "@/components/AppShell";
import Link from "next/link";
import styles from "./admin.module.css";

export default function AdminForbidden() {
  return (
    <AppShell activeNav="projects">
      <section className={styles.page}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>403</p>
          <h1 className={styles.title}>Admin Access Required</h1>
          <p className={styles.description}>
            Your account is authenticated, but it is not authorized for platform admin access.
          </p>
          <Link className={styles.backLink} href="/">
            Return Home
          </Link>
        </header>
      </section>
    </AppShell>
  );
}
