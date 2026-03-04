import { AppShell } from "@/components/AppShell";
import {
  PlatformAdminAccessError,
  requirePlatformAdmin,
} from "@/lib/server/auth/platform-admin";
import {
  getAdminUsageAnalytics,
  type AdminUsageBreakdownRow,
  type AdminUsageWindowDays,
} from "@/lib/server/admin/usage-analytics";
import { forbidden } from "next/navigation";
import Link from "next/link";
import styles from "./usage.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

const WINDOW_OPTIONS: AdminUsageWindowDays[] = [7, 30, 90];

function getParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseWindowDays(raw?: string): AdminUsageWindowDays {
  const parsed = Number.parseInt(raw ?? "30", 10);
  return WINDOW_OPTIONS.includes(parsed as AdminUsageWindowDays) ? (parsed as AdminUsageWindowDays) : 30;
}

function renderBreakdownRows(rows: AdminUsageBreakdownRow[], emptyLabel: string) {
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={5} className={styles.emptyCell}>
          {emptyLabel}
        </td>
      </tr>
    );
  }

  return rows.map((row) => (
    <tr key={row.key}>
      <td className={styles.mono}>{row.key}</td>
      <td>{row.requests.toLocaleString()}</td>
      <td>{row.inputTokens.toLocaleString()}</td>
      <td>{row.outputTokens.toLocaleString()}</td>
      <td>{row.totalTokens.toLocaleString()}</td>
    </tr>
  ));
}

export default async function AdminUsagePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      forbidden();
    }
    throw error;
  }

  const resolved = (await searchParams) ?? {};
  const windowDays = parseWindowDays(getParam(resolved, "window"));
  const analytics = await getAdminUsageAnalytics({ windowDays });

  return (
    <AppShell activeNav="admin" forceAdminNav>
      <section className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Platform Admin</p>
            <h1 className={styles.title}>Usage Analytics</h1>
            <p className={styles.description}>
              Token and request analytics for the selected period. `legacy_unknown` buckets represent pre-attribution
              usage rows and stay visible for compatibility.
            </p>
          </div>
          <Link className={styles.backLink} href="/admin">
            Back to Admin Home
          </Link>
        </header>

        <form className={styles.filters} method="get">
          <label htmlFor="window">Window</label>
          <select id="window" name="window" defaultValue={String(windowDays)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
          <button type="submit">Apply</button>
        </form>

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <h2>Requests</h2>
            <p>{analytics.totals.requests.toLocaleString()}</p>
          </article>
          <article className={styles.summaryCard}>
            <h2>Total Tokens</h2>
            <p>{analytics.totals.totalTokens.toLocaleString()}</p>
          </article>
          <article className={styles.summaryCard}>
            <h2>Users / Workspaces</h2>
            <p>
              {analytics.totals.uniqueUsers.toLocaleString()} / {analytics.totals.uniqueWorkspaces.toLocaleString()}
            </p>
          </article>
          <article className={styles.summaryCard}>
            <h2>Attributed / Legacy</h2>
            <p>
              {analytics.totals.attributedRequests.toLocaleString()} / {analytics.totals.legacyRequests.toLocaleString()}
            </p>
          </article>
        </section>

        <section className={styles.tableBlock}>
          <h2>By Source</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Requests</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>{renderBreakdownRows(analytics.bySource, "No usage rows for this period.")}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.tableBlock}>
          <h2>By Context Page</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Context</th>
                  <th>Requests</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>{renderBreakdownRows(analytics.byContextPage, "No context rows for this period.")}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.tableBlock}>
          <h2>By Model</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Requests</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>{renderBreakdownRows(analytics.byModel, "No model rows for this period.")}</tbody>
            </table>
          </div>
        </section>

        <section className={styles.tableBlock}>
          <h2>Daily Trend</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Requests</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byDay.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyCell}>
                      No daily usage rows for this period.
                    </td>
                  </tr>
                ) : (
                  analytics.byDay.map((row) => (
                    <tr key={row.day}>
                      <td className={styles.mono}>{row.day}</td>
                      <td>{row.requests.toLocaleString()}</td>
                      <td>{row.inputTokens.toLocaleString()}</td>
                      <td>{row.outputTokens.toLocaleString()}</td>
                      <td>{row.totalTokens.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </AppShell>
  );
}
