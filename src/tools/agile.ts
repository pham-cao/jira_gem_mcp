import { z } from "zod";
import { slimIssue, slimSprint } from "../jira/format.js";
import { defineTool, issueKey, type ToolContext } from "./define.js";
import { DEFAULT_SEARCH_FIELDS } from "./issues.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */

const AGILE = "/rest/agile/1.0";

/** Agile list endpoints report `isLast` and only sometimes `total`. */
function agilePage<T>(res: any, items: T[]) {
  const hasMore = typeof res.isLast === "boolean" ? !res.isLast : res.startAt + items.length < res.total;
  return { items, total: typeof res.total === "number" ? res.total : null, startAt: res.startAt, maxResults: res.maxResults, hasMore };
}

const paging = (max: number) => ({
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(max),
});

export function register(ctx: ToolContext): void {
  const { client } = ctx;

  defineTool(
    ctx,
    "jira_list_boards",
    {
      description: "List agile boards, optionally filtered by project, name or type.",
      input: { projectKey: z.string().trim().optional(), name: z.string().optional(), type: z.enum(["scrum", "kanban"]).optional(), ...paging(50) },
    },
    async (a) => {
      const res = await client.get<any>(`${AGILE}/board`, {
        projectKeyOrId: a.projectKey?.toUpperCase(),
        name: a.name,
        type: a.type,
        startAt: a.startAt,
        maxResults: a.maxResults,
      });
      return agilePage(res, res.values.map((b: any) => ({ id: b.id, name: b.name, type: b.type })));
    },
  );

  defineTool(
    ctx,
    "jira_list_sprints",
    {
      description: "List sprints of a board. state is a comma list of future, active, closed (default active,future).",
      input: { boardId: z.number().int(), state: z.string().default("active,future"), ...paging(50) },
    },
    async (a) => {
      const res = await client.get<any>(`${AGILE}/board/${a.boardId}/sprint`, { state: a.state, startAt: a.startAt, maxResults: a.maxResults });
      return agilePage(res, res.values.map(slimSprint));
    },
  );

  defineTool(
    ctx,
    "jira_get_sprint_issues",
    {
      description: "List issues in a sprint, optionally filtered by JQL.",
      input: { sprintId: z.number().int(), jql: z.string().optional(), ...paging(20) },
    },
    async (a) => {
      const res = await client.get<any>(`${AGILE}/sprint/${a.sprintId}/issue`, {
        jql: a.jql,
        fields: DEFAULT_SEARCH_FIELDS.join(","),
        startAt: a.startAt,
        maxResults: a.maxResults,
      });
      return agilePage(
        res,
        res.issues.map((i: any) => slimIssue(i, { baseUrl: client.baseUrl })),
      );
    },
  );

  defineTool(
    ctx,
    "jira_move_issues_to_sprint",
    {
      description: "Move up to 50 issues into a sprint.",
      input: { sprintId: z.number().int(), issueKeys: z.array(z.string().trim().min(1)).min(1).max(50) },
      write: true,
    },
    async (a) => {
      await client.post(`${AGILE}/sprint/${a.sprintId}/issue`, { issues: a.issueKeys.map(issueKey) });
      return undefined;
    },
  );

  const sprintFields = {
    startDate: z.string().optional().describe("ISO-8601"),
    endDate: z.string().optional().describe("ISO-8601"),
    goal: z.string().optional(),
  };
  const defined = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

  defineTool(
    ctx,
    "jira_create_sprint",
    { description: "Create a future sprint on a board.", input: { boardId: z.number().int(), name: z.string().min(1), ...sprintFields }, write: true },
    async ({ boardId, ...rest }) => slimSprint(await client.post<any>(`${AGILE}/sprint`, { originBoardId: boardId, ...defined(rest) })),
  );

  defineTool(
    ctx,
    "jira_update_sprint",
    {
      description: "Update a sprint: rename, change dates/goal, start it (state=active) or close it (state=closed).",
      input: { sprintId: z.number().int(), name: z.string().min(1).optional(), state: z.enum(["active", "closed"]).optional(), ...sprintFields },
      write: true,
    },
    async ({ sprintId, ...rest }) => {
      const body = defined(rest);
      if (Object.keys(body).length === 0) throw new Error("Cần ít nhất một thuộc tính sprint để cập nhật.");
      return slimSprint(await client.post<any>(`${AGILE}/sprint/${sprintId}`, body));
    },
  );
}
