import { z } from "zod";
import { paged, slimComment } from "../jira/format.js";
import { defineTool, issueKey } from "./define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */
const key = z.string().trim().min(1).describe("Issue key, e.g. ABC-123");
export function register(ctx) {
    const { client } = ctx;
    defineTool(ctx, "jira_get_comments", {
        description: "List comments of an issue, oldest first, with paging.",
        input: { issueKey: key, startAt: z.number().int().min(0).default(0), maxResults: z.number().int().min(1).max(100).default(50) },
    }, async (args) => {
        const res = await client.get(`/rest/api/2/issue/${issueKey(args.issueKey)}/comment`, {
            startAt: args.startAt,
            maxResults: args.maxResults,
            orderBy: "created",
        });
        return paged(res.comments.map(slimComment), { total: res.total, startAt: res.startAt, maxResults: res.maxResults });
    });
    defineTool(ctx, "jira_add_comment", { description: "Add a comment (Jira wiki markup) to an issue.", input: { issueKey: key, body: z.string().min(1) }, write: true }, async (args) => {
        const id = issueKey(args.issueKey);
        const res = await client.post(`/rest/api/2/issue/${id}/comment`, { body: args.body });
        return { id: res.id, url: `${client.baseUrl}/browse/${id}?focusedCommentId=${res.id}` };
    });
    defineTool(ctx, "jira_update_comment", {
        description: "Replace the body of an existing comment.",
        input: { issueKey: key, commentId: z.string().min(1), body: z.string().min(1) },
        write: true,
    }, async (args) => {
        const res = await client.put(`/rest/api/2/issue/${issueKey(args.issueKey)}/comment/${encodeURIComponent(args.commentId)}`, {
            body: args.body,
        });
        return { id: res.id };
    });
}
