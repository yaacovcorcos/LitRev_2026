import { AppShell } from "@/components/AppShell";
import {
  PlatformAdminAccessError,
  requirePlatformAdmin,
} from "@/lib/server/auth/platform-admin";
import {
  listAdminUsers,
  type AdminUsersSortKey,
} from "@/lib/server/admin/users-directory";
import { forbidden } from "next/navigation";
import Link from "next/link";
import styles from "./users.module.css";
import { AdminUserRoleControls } from "./AdminUserRoleControls";

type SearchParams = Record<string, string | string[] | undefined>;

const SORT_OPTIONS: Array<{ value: AdminUsersSortKey; label: string }> = [
  { value: "created_desc", label: "Created (newest)" },
  { value: "created_asc", label: "Created (oldest)" },
  { value: "name_asc", label: "Name (A-Z)" },
  { value: "name_desc", label: "Name (Z-A)" },
  { value: "email_asc", label: "Email (A-Z)" },
  { value: "email_desc", label: "Email (Z-A)" },
];

function getParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function parseDateEnd(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

function buildQueryString(searchParams: SearchParams, updates: Record<string, string | undefined>): string {
  const params = new URLSearchParams();

  Object.entries(searchParams).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value[0]) params.set(key, value[0]);
      return;
    }
    if (value) params.set(key, value);
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (!value) {
      params.delete(key);
      return;
    }
    params.set(key, value);
  });

  const qs = params.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  let adminContext: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminContext = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      forbidden();
    }
    throw error;
  }

  const resolved = (await searchParams) ?? {};

  const q = getParam(resolved, "q")?.trim();
  const admin = getParam(resolved, "admin") ?? "all";
  const sort = (getParam(resolved, "sort") as AdminUsersSortKey | undefined) ?? "created_desc";
  const page = Number.parseInt(getParam(resolved, "page") ?? "1", 10);
  const pageSize = Number.parseInt(getParam(resolved, "pageSize") ?? "25", 10);
  const createdFromRaw = getParam(resolved, "createdFrom");
  const createdToRaw = getParam(resolved, "createdTo");
  const seenFromRaw = getParam(resolved, "seenFrom");
  const seenToRaw = getParam(resolved, "seenTo");

  const directory = await listAdminUsers({
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 25,
    search: q,
    admin: admin === "true" || admin === "false" ? admin : "all",
    sort: SORT_OPTIONS.some((option) => option.value === sort) ? sort : "created_desc",
    createdFrom: parseDate(createdFromRaw),
    createdTo: parseDateEnd(createdToRaw),
    seenFrom: parseDate(seenFromRaw),
    seenTo: parseDateEnd(seenToRaw),
  });

  const prevHref =
    directory.page > 1
      ? `/admin/users${buildQueryString(resolved, { page: String(directory.page - 1) })}`
      : null;
  const nextHref =
    directory.page < directory.totalPages
      ? `/admin/users${buildQueryString(resolved, { page: String(directory.page + 1) })}`
      : null;

  return (
    <AppShell activeNav="admin" forceAdminNav>
      <section className={styles.page}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Platform Admin</p>
            <h1 className={styles.title}>Users Directory</h1>
            <p className={styles.description}>
              Read-only user visibility with server-side pagination and activity filters.
            </p>
          </div>
          <Link className={styles.backLink} href="/admin">
            Back to Admin Home
          </Link>
        </header>

        <form className={styles.filters} method="get">
          <input type="text" name="q" placeholder="Search name or email" defaultValue={q ?? ""} />
          <select name="admin" defaultValue={admin}>
            <option value="all">All Users</option>
            <option value="true">Admins Only</option>
            <option value="false">Non-admins</option>
          </select>
          <select name="sort" defaultValue={sort}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <input type="date" name="createdFrom" defaultValue={createdFromRaw ?? ""} />
          <input type="date" name="createdTo" defaultValue={createdToRaw ?? ""} />
          <input type="date" name="seenFrom" defaultValue={seenFromRaw ?? ""} />
          <input type="date" name="seenTo" defaultValue={seenToRaw ?? ""} />
          <select name="pageSize" defaultValue={String(directory.pageSize)}>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
          <button type="submit">Apply</button>
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Created</th>
                <th>Verified</th>
                <th>Platform Admin</th>
                <th>Last Seen</th>
                <th>Workspaces</th>
                <th>Projects</th>
                <th>7d Tokens</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {directory.rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className={styles.empty}>
                    No users found for the selected filters.
                  </td>
                </tr>
              ) : (
                directory.rows.map((row) => (
                  <tr key={row.id}>
                    <td className={styles.mono}>{row.id}</td>
                    <td>{row.name}</td>
                    <td>{row.email}</td>
                    <td>{row.createdAt.toISOString().slice(0, 10)}</td>
                    <td>{row.emailVerified ? "Yes" : "No"}</td>
                    <td>{row.isPlatformAdmin ? "Yes" : "No"}</td>
                    <td>{row.lastSeenAt ? row.lastSeenAt.toISOString().slice(0, 10) : "-"}</td>
                    <td>{row.workspaceCount}</td>
                    <td>{row.projectCount}</td>
                    <td>
                      {row.totalTokens7d.toLocaleString()} ({row.inputTokens7d.toLocaleString()} in /{" "}
                      {row.outputTokens7d.toLocaleString()} out)
                    </td>
                    <td>
                      <AdminUserRoleControls
                        targetUserId={row.id}
                        isPlatformAdmin={row.isPlatformAdmin}
                        isSelf={row.id === adminContext.userId}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className={styles.footer}>
          <span>
            Page {directory.page} of {directory.totalPages} • {directory.totalCount.toLocaleString()} users
          </span>
          <div className={styles.pager}>
            {prevHref ? <Link href={prevHref}>Previous</Link> : <span>Previous</span>}
            {nextHref ? <Link href={nextHref}>Next</Link> : <span>Next</span>}
          </div>
        </footer>
      </section>
    </AppShell>
  );
}
