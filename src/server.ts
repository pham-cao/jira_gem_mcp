import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "./http/client.js";
import type { JiraClient } from "./jira/client.js";
import { FieldCache } from "./jira/fields.js";
import { slimUser, type SlimUser } from "./jira/format.js";
import * as agile from "./tools/agile.js";
import * as attachments from "./tools/attachments.js";
import * as comments from "./tools/comments.js";
import type { ToolContext } from "./tools/define.js";
import * as issues from "./tools/issues.js";
import * as links from "./tools/links.js";
import * as meta from "./tools/meta.js";
import * as worklogs from "./tools/worklogs.js";
import { registerConfluence } from "./tools/confluence/index.js";

// Works from both src/ (tests) and dist/ (build): package.json is one level up.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

export async function startupChecks(client: JiraClient): Promise<{ user: SlimUser; agile: boolean }> {
  const user = slimUser(await client.get("/rest/api/2/myself")) as SlimUser;
  const agileOk = await client.get("/rest/agile/1.0/board", { maxResults: 1 }).then(
    () => true,
    () => false,
  );
  return { user, agile: agileOk };
}

export async function checkConfluence(c: HttpClient): Promise<{ name: string }> {
  const u = await c.get<{ type?: string; username?: string }>("/rest/api/user/current");
  if (u.type === "anonymous") throw new Error("Đăng nhập Confluence thất bại (sai username/password hoặc tài khoản bị khoá/CAPTCHA).");
  return { name: u.username ?? "" };
}

export function createServer(client: JiraClient, opts: { readOnly: boolean; agile: boolean; confluence?: HttpClient }): McpServer {
  const server = new McpServer({ name: "jira-server-mcp", version });
  const ctx: ToolContext = { server, client, fields: new FieldCache(client), readOnly: opts.readOnly, ...(opts.confluence && { confluence: opts.confluence }) };
  for (const group of [meta, issues, comments, worklogs, links, attachments]) group.register(ctx);
  if (opts.agile) agile.register(ctx);
  if (opts.confluence) registerConfluence(ctx);
  return server;
}
