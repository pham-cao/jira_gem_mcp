import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatError } from "./http/errors.js";
import { FieldCache } from "./jira/fields.js";
import { slimUser } from "./jira/format.js";
import * as agile from "./tools/agile.js";
import * as attachments from "./tools/attachments.js";
import * as comments from "./tools/comments.js";
import * as issues from "./tools/issues.js";
import * as links from "./tools/links.js";
import * as meta from "./tools/meta.js";
import * as worklogs from "./tools/worklogs.js";
import { registerConfluence } from "./tools/confluence/index.js";
// Works from both src/ (tests) and dist/ (build): package.json is one level up.
const { version } = createRequire(import.meta.url)("../package.json");
export async function startupChecks(client) {
    const user = slimUser(await client.get("/rest/api/2/myself"));
    const agileOk = await client.get("/rest/agile/1.0/board", { maxResults: 1 }).then(() => true, () => false);
    return { user, agile: agileOk };
}
const CONFLUENCE_ANONYMOUS = "Đăng nhập Confluence thất bại (sai username/password hoặc tài khoản bị khoá/CAPTCHA).";
export async function checkConfluence(c) {
    const u = await c.get("/rest/api/user/current");
    if (u.type === "anonymous")
        throw new Error(CONFLUENCE_ANONYMOUS);
    return { name: u.username ?? "" };
}
// Startup wrapper: every failure names Confluence, so it is not mistaken for a Jira login error.
export async function confluenceStartup(c) {
    try {
        return await checkConfluence(c);
    }
    catch (e) {
        if (e instanceof Error && e.message === CONFLUENCE_ANONYMOUS)
            throw e;
        throw new Error(`Đăng nhập Confluence thất bại: ${formatError(e)}`);
    }
}
export function createServer(client, opts) {
    const server = new McpServer({ name: "jira-server-mcp", version });
    const ctx = { server, client, fields: new FieldCache(client), readOnly: opts.readOnly, ...(opts.confluence && { confluence: opts.confluence }) };
    for (const group of [meta, issues, comments, worklogs, links, attachments])
        group.register(ctx);
    if (opts.agile)
        agile.register(ctx);
    if (opts.confluence)
        registerConfluence(ctx);
    return server;
}
