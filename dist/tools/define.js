import { z } from "zod";
import { formatError } from "../jira/errors.js";
export function jsonResult(data) {
    return { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }] };
}
export function defineTool(ctx, name, spec, fn) {
    if (spec.write && ctx.readOnly)
        return;
    const handler = async (args) => {
        try {
            return jsonResult(await fn(args));
        }
        catch (e) {
            return { isError: true, content: [{ type: "text", text: formatError(e) }] };
        }
    };
    ctx.server.registerTool(name, { description: spec.description, inputSchema: spec.input, annotations: { readOnlyHint: spec.readOnlyHint ?? !spec.write } }, 
    // The SDK's generic callback type cannot be expressed through our own generic S.
    handler);
}
/** Normalises user-supplied issue keys ("  abc-1 " → "ABC-1"). */
export const issueKey = (k) => k.trim().toUpperCase();
export function requireConfluence(ctx) {
    if (!ctx.confluence)
        throw new Error("Confluence chưa được cấu hình");
    return ctx.confluence;
}
export const numericId = z.string().trim().regex(/^\d+$/, "must be a numeric id");
