import { z } from "zod";
import { defineTool, issueKey, type ToolContext } from "./define.js";

export function register(ctx: ToolContext): void {
  defineTool(
    ctx,
    "jira_link_issues",
    {
      description: "Link two issues. type is a link type name from jira_list_link_types (e.g. Blocks: outwardIssue blocks inwardIssue).",
      input: { type: z.string().min(1), inwardIssue: z.string().trim().min(1), outwardIssue: z.string().trim().min(1), comment: z.string().optional() },
      write: true,
    },
    async (args) => {
      await ctx.client.post("/rest/api/2/issueLink", {
        type: { name: args.type },
        inwardIssue: { key: issueKey(args.inwardIssue) },
        outwardIssue: { key: issueKey(args.outwardIssue) },
        ...(args.comment ? { comment: { body: args.comment } } : {}),
      });
      return undefined;
    },
  );
}
