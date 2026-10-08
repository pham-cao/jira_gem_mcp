import { z } from "zod";
import { paged, slimWorklog, toJiraDate } from "../jira/format.js";
import { defineTool, issueKey } from "./define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */
const key = z.string().trim().min(1).describe("Issue key, e.g. ABC-123");
export function register(ctx) {
    const { client } = ctx;
    defineTool(ctx, "jira_get_worklogs", { description: "List work logs of an issue.", input: { issueKey: key } }, async (args) => {
        const res = await client.get(`/rest/api/2/issue/${issueKey(args.issueKey)}/worklog`);
        return paged(res.worklogs.map(slimWorklog), { total: res.total, startAt: res.startAt, maxResults: res.maxResults });
    });
    defineTool(ctx, "jira_add_worklog", {
        description: "Log work on an issue. timeSpent like \"2h 30m\"; started is ISO-8601 (default now).",
        input: {
            issueKey: key,
            timeSpent: z.string().min(1),
            started: z.string().optional().describe("ISO-8601, e.g. 2026-10-08T09:00:00+07:00"),
            comment: z.string().optional(),
            adjustEstimate: z.enum(["auto", "leave", "new", "manual"]).optional(),
            newEstimate: z.string().optional().describe("Required when adjustEstimate=new"),
            reduceBy: z.string().optional().describe("Required when adjustEstimate=manual"),
        },
        write: true,
    }, async (args) => {
        if (args.adjustEstimate === "new" && !args.newEstimate)
            throw new Error("adjustEstimate=new cần newEstimate.");
        if (args.adjustEstimate === "manual" && !args.reduceBy)
            throw new Error("adjustEstimate=manual cần reduceBy.");
        const res = await client.post(`/rest/api/2/issue/${issueKey(args.issueKey)}/worklog`, { timeSpent: args.timeSpent, started: toJiraDate(args.started), ...(args.comment ? { comment: args.comment } : {}) }, { adjustEstimate: args.adjustEstimate, newEstimate: args.newEstimate, reduceBy: args.reduceBy });
        return { id: res.id, timeSpent: res.timeSpent, started: res.started };
    });
}
