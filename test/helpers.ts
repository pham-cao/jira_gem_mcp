import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { JiraClient } from "../src/jira/client.js";
import { FieldCache } from "../src/jira/fields.js";
import type { ToolContext } from "../src/tools/define.js";

export const BASE_URL = "https://jira.test/ctx";
export const API = `${BASE_URL}/rest/api/2`;
export const AGILE = `${BASE_URL}/rest/agile/1.0`;

export const mswServer = setupServer();

export function useMsw(): void {
  beforeAll(() => mswServer.listen({ onUnhandledRequest: "error" }));
  afterEach(() => mswServer.resetHandlers());
  afterAll(() => mswServer.close());
}

export function makeClient(overrides: { password?: string; timeoutMs?: number } = {}): JiraClient {
  return new JiraClient(
    { baseUrl: BASE_URL, username: "alice", password: overrides.password ?? "s3cret", timeoutMs: overrides.timeoutMs ?? 200 },
    { retryDelayMs: 0 },
  );
}

export interface Harness {
  client: Client;
  call(name: string, args?: Record<string, unknown>): Promise<CallToolResult>;
  json(name: string, args?: Record<string, unknown>): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  text(name: string, args?: Record<string, unknown>): Promise<string>;
  toolNames(): Promise<string[]>;
}

export async function connectTools(registers: Array<(ctx: ToolContext) => void>, opts: { readOnly?: boolean } = {}): Promise<Harness> {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  const jira = makeClient();
  const ctx: ToolContext = { server, client: jira, fields: new FieldCache(jira), readOnly: opts.readOnly ?? false };
  for (const register of registers) register(ctx);
  return connectServer(server);
}

export async function connectServer(server: McpServer): Promise<Harness> {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<CallToolResult>;
  const text = async (name: string, args?: Record<string, unknown>) => {
    const r = await call(name, args);
    return (r.content[0] as { text: string }).text;
  };
  return {
    client,
    call,
    text,
    async json(name, args) {
      const r = await call(name, args);
      if (r.isError) throw new Error(`tool ${name} returned error: ${(r.content[0] as { text: string }).text}`);
      return JSON.parse((r.content[0] as { text: string }).text);
    },
    async toolNames() {
      // A server with zero tools does not advertise the tools capability at all.
      if (!client.getServerCapabilities()?.tools) return [];
      return (await client.listTools()).tools.map((t) => t.name).sort();
    },
  };
}
