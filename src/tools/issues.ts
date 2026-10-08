import { z } from "zod";
import { paged, slimIssue } from "../jira/format.js";
import { defineTool, issueKey, type ToolContext } from "./define.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */

export const DEFAULT_SEARCH_FIELDS = ["summary", "status", "assignee", "issuetype", "priority", "updated"];

const key = z.string().trim().min(1).describe("Issue key, e.g. ABC-123");

export function register(ctx: ToolContext): void {
  const { client } = ctx;
  const base = client.baseUrl;

  defineTool(
    ctx,
    "jira_search",
    {
      description: "Search issues with JQL. Returns a page of slim issues plus total/hasMore; page with startAt.",
      input: {
        jql: z.string().min(1),
        fields: z.array(z.string()).optional().describe("Field ids to return; default summary,status,assignee,issuetype,priority,updated"),
        maxResults: z.number().int().min(1).max(100).default(20),
        startAt: z.number().int().min(0).default(0),
      },
    },
    async ({ jql, fields, maxResults, startAt }) => {
      const res = await client.post<any>("/rest/api/2/search", { jql, startAt, maxResults, fields: fields ?? DEFAULT_SEARCH_FIELDS });
      const sprintFieldId = fields ? await ctx.fields.sprintFieldId() : undefined;
      return paged(
        res.issues.map((i: any) => slimIssue(i, { baseUrl: base, sprintFieldId })),
        { total: res.total, startAt: res.startAt, maxResults: res.maxResults },
      );
    },
  );

  defineTool(
    ctx,
    "jira_get_issue",
    {
      description: "Get one issue with details: description, links, subtasks, attachments, sprint and the 10 latest comments.",
      input: { issueKey: key, expand: z.array(z.string()).optional().describe("e.g. changelog, renderedFields") },
    },
    async (args) => {
      const [raw, sprintFieldId] = await Promise.all([
        client.get<any>(`/rest/api/2/issue/${issueKey(args.issueKey)}`, { expand: args.expand?.join(",") }),
        ctx.fields.sprintFieldId(),
      ]);
      return slimIssue(raw, { baseUrl: base, sprintFieldId, full: true });
    },
  );

  defineTool(
    ctx,
    "jira_get_transitions",
    { description: "List workflow transitions currently available for an issue.", input: { issueKey: key } },
    async (args) => {
      const res = await client.get<any>(`/rest/api/2/issue/${issueKey(args.issueKey)}/transitions`);
      return res.transitions.map((t: any) => ({ id: t.id, name: t.name, to: t.to?.name }));
    },
  );
}
