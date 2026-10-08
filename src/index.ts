#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HttpClient } from "./http/client.js";
import { JiraClient } from "./jira/client.js";
import { formatError } from "./jira/errors.js";
import { checkConfluence, createServer, startupChecks } from "./server.js";

const log = (msg: string) => process.stderr.write(`[jira-mcp] ${msg}\n`);

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (config.insecureTls) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    log("CẢNH BÁO: JIRA_INSECURE_TLS=true — bỏ qua kiểm tra chứng chỉ TLS.");
  }
  const client = new JiraClient(config);
  const { user, agile } = await startupChecks(client);
  let confluence: HttpClient | undefined;
  if (config.confluence) {
    confluence = new HttpClient({ ...config.confluence, timeoutMs: config.timeoutMs, service: "Confluence" });
    await checkConfluence(confluence);
  }
  const server = createServer(client, { readOnly: config.readOnly, agile, ...(confluence && { confluence }) });
  log(`connected as ${user.name}, agile tools: ${agile ? "on" : "off"}, confluence: ${confluence ? "on" : "off"}, read-only: ${config.readOnly ? "on" : "off"}`);
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  log(formatError(e));
  process.exit(1);
});
