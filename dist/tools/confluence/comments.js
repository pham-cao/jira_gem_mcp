import { z } from "zod";
import { confluencePaged, slimConfluenceComment, toStorage } from "../../confluence/format.js";
import { defineTool, numericId, requireConfluence } from "../define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */
const limit = z.number().int().min(1).max(100).default(25);
const start = z.number().int().min(0).default(0);
export function register(ctx) {
    const conf = () => requireConfluence(ctx);
    defineTool(ctx, "confluence_get_comments", { description: "List a page's comments (all depths) with Markdown bodies; replies carry parentId. Paged.", input: { pageId: numericId, limit, start } }, async (args) => {
        const res = await conf().get(`/rest/api/content/${args.pageId}/child/comment`, {
            expand: "body.storage,version,history,ancestors",
            depth: "all",
            limit: args.limit,
            start: args.start,
        });
        return confluencePaged(res.results.map(slimConfluenceComment), res);
    });
    defineTool(ctx, "confluence_add_comment", {
        description: "Add a comment to a page (body is Markdown). Pass parentCommentId to reply to a comment.",
        input: { pageId: numericId, body: z.string().min(1), parentCommentId: numericId.optional() },
        write: true,
    }, async (args) => {
        const res = await conf().post("/rest/api/content", {
            type: "comment",
            container: { id: args.pageId, type: "page" },
            ...(args.parentCommentId && { ancestors: [{ id: args.parentCommentId }] }),
            body: { storage: { value: toStorage(args.body, "markdown"), representation: "storage" } },
        });
        return slimConfluenceComment(res);
    });
}
