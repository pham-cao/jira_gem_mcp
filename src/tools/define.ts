import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape, type ZodTypeAny } from "zod";
import type { HttpClient } from "../http/client.js";
import type { JiraClient } from "../jira/client.js";
import { formatError } from "../jira/errors.js";
import type { FieldCache } from "../jira/fields.js";

export interface ToolContext {
  server: McpServer;
  client: JiraClient;
  fields: FieldCache;
  readOnly: boolean;
  confluence?: HttpClient;
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }] };
}

export function defineTool<S extends ZodRawShape>(
  ctx: ToolContext,
  name: string,
  spec: { description: string; input: S; write?: boolean; readOnlyHint?: boolean },
  fn: (args: z.objectOutputType<S, ZodTypeAny>) => Promise<unknown>,
): void {
  if (spec.write && ctx.readOnly) return;
  const handler = async (args: z.objectOutputType<S, ZodTypeAny>): Promise<CallToolResult> => {
    try {
      return jsonResult(await fn(args));
    } catch (e) {
      return { isError: true, content: [{ type: "text", text: formatError(e) }] };
    }
  };
  ctx.server.registerTool(
    name,
    { description: spec.description, inputSchema: spec.input, annotations: { readOnlyHint: spec.readOnlyHint ?? !spec.write } },
    // The SDK's generic callback type cannot be expressed through our own generic S.
    handler as never,
  );
}

/** Normalises user-supplied issue keys ("  abc-1 " → "ABC-1"). */
export const issueKey = (k: string) => k.trim().toUpperCase();

export function requireConfluence(ctx: ToolContext): HttpClient {
  if (!ctx.confluence) throw new Error("Confluence chưa được cấu hình");
  return ctx.confluence;
}

export const numericId = z.string().trim().regex(/^\d+$/, "must be a numeric id");
