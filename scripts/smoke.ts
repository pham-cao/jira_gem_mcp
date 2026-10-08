/**
 * Manual smoke test against a real Jira: spawns dist/index.js and calls READ-ONLY tools.
 * Usage: npm run build && npm run smoke   (credentials from .env; set CONFLUENCE_BASE_URL to also smoke Confluence)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js"],
  env: process.env as Record<string, string>,
  stderr: "inherit",
});
const client = new Client({ name: "smoke", version: "0.0.0" });
let failed = false;

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  const r = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = (r.content[0] as { text: string }).text;
  if (r.isError) {
    failed = true;
    console.log(`FAIL ${name}: ${text}`);
    return undefined;
  }
  return JSON.parse(text);
}

await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
console.log(`OK   listTools: ${tools.length} tools`);

const search = await call("jira_search", { jql: "assignee = currentUser() ORDER BY updated DESC", maxResults: 5 });
if (search) console.log(`OK   jira_search: ${search.items.length}/${search.total} issues`);

const first = search?.items[0]?.key;
if (first) {
  const issue = await call("jira_get_issue", { issueKey: first });
  if (issue) console.log(`OK   jira_get_issue ${first}: "${issue.summary}" [${issue.status}]`);
}

if (tools.includes("jira_list_boards")) {
  const boards = await call("jira_list_boards", { maxResults: 5 });
  if (boards) console.log(`OK   jira_list_boards: ${boards.items.map((b: { name: string }) => b.name).join(", ")}`);
}

if (tools.includes("confluence_list_spaces")) {
  const spaces = await call("confluence_list_spaces", { limit: 5 });
  if (spaces) console.log(`OK   confluence_list_spaces: ${spaces.items.map((s: { key: string }) => s.key).join(", ")}`);

  const pages = await call("confluence_search", { cql: "type = page ORDER BY lastmodified DESC", limit: 3 });
  if (pages) console.log(`OK   confluence_search: ${pages.items.length} pages`);

  const pageId = pages?.items[0]?.id;
  if (pageId) {
    const page = await call("confluence_get_page", { pageId, maxChars: 500 });
    if (page) console.log(`OK   confluence_get_page ${pageId}: "${page.title}" [${page.space}] v${page.version}`);
  }
}

await client.close();
process.exit(failed ? 1 : 0);
