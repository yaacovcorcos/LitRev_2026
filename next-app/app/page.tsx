import { HomeClient } from "@/app/HomeClient";
import { getHomeWorkspaceBootstrap } from "@/lib/server/home-bootstrap";

type SearchParams = Record<string, string | string[] | undefined>;

function getParam(searchParams: SearchParams, key: string): string | undefined {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function serializeBootstrapForInlineScript(input: unknown): string {
  return JSON.stringify(input)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const [bootstrap, resolvedSearchParams] = await Promise.all([
    getHomeWorkspaceBootstrap(),
    searchParams,
  ]);
  const shouldOpenFromQuery = getParam(resolvedSearchParams ?? {}, "create") === "new";
  const bootstrapScript = `window.__litrevHomeBootstrap=${serializeBootstrapForInlineScript(bootstrap)};`;

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: bootstrapScript }} />
      <HomeClient bootstrap={bootstrap} shouldOpenFromQuery={shouldOpenFromQuery} />
    </>
  );
}
