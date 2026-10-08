import { z } from "zod";
import { paged, slimIssue } from "../jira/format.js";
import { defineTool, issueKey } from "./define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */
export const DEFAULT_SEARCH_FIELDS = ["summary", "status", "assignee", "issuetype", "priority", "updated"];
const key = z.string().trim().min(1).describe("Issue key, e.g. ABC-123");
const issueFieldInput = {
    summary: z.string().min(1).optional(),
    description: z.string().optional().describe("Jira wiki markup"),
    assignee: z.string().nullable().optional().describe("Username (name); null to unassign"),
    priority: z.string().optional().describe("Priority name"),
    labels: z.array(z.string()).optional(),
    parentKey: z.string().optional().describe("Parent issue key, for sub-tasks"),
    customFields: z.record(z.unknown()).optional().describe('Raw field values by id, e.g. {"customfield_10006": 5}'),
};
export function buildIssueFields(input) {
    const f = {};
    if (input.summary !== undefined)
        f.summary = input.summary;
    if (input.description !== undefined)
        f.description = input.description;
    if (input.assignee !== undefined)
        f.assignee = input.assignee === null ? null : { name: input.assignee };
    if (input.priority !== undefined)
        f.priority = { name: input.priority };
    if (input.labels !== undefined)
        f.labels = input.labels;
    if (input.parentKey !== undefined)
        f.parent = { key: issueKey(input.parentKey) };
    return { ...f, ...input.customFields };
}
export function register(ctx) {
    const { client } = ctx;
    const base = client.baseUrl;
    defineTool(ctx, "jira_search", {
        description: "Search issues with JQL. Returns a page of slim issues plus total/hasMore; page with startAt.",
        input: {
            jql: z.string().min(1),
            fields: z.array(z.string()).optional().describe("Field ids to return; default summary,status,assignee,issuetype,priority,updated"),
            maxResults: z.number().int().min(1).max(100).default(20),
            startAt: z.number().int().min(0).default(0),
        },
    }, async ({ jql, fields, maxResults, startAt }) => {
        const res = await client.post("/rest/api/2/search", { jql, startAt, maxResults, fields: fields ?? DEFAULT_SEARCH_FIELDS });
        const sprintFieldId = fields ? await ctx.fields.sprintFieldId() : undefined;
        return paged(res.issues.map((i) => slimIssue(i, { baseUrl: base, sprintFieldId, requested: fields })), { total: res.total, startAt: res.startAt, maxResults: res.maxResults });
    });
    defineTool(ctx, "jira_get_issue", {
        description: "Get one issue with details: description, links, subtasks, attachments, sprint, time tracking and the 10 latest comments. expand: changelog (status/field history), renderedFields (HTML description).",
        input: { issueKey: key, expand: z.array(z.enum(["changelog", "renderedFields"])).optional() },
    }, async (args) => {
        const [raw, sprintFieldId] = await Promise.all([
            client.get(`/rest/api/2/issue/${issueKey(args.issueKey)}`, { expand: args.expand?.join(",") }),
            ctx.fields.sprintFieldId(),
        ]);
        return slimIssue(raw, { baseUrl: base, sprintFieldId, full: true });
    });
    defineTool(ctx, "jira_get_transitions", { description: "List workflow transitions currently available for an issue.", input: { issueKey: key } }, async (args) => {
        const res = await client.get(`/rest/api/2/issue/${issueKey(args.issueKey)}/transitions`);
        return res.transitions.map((t) => ({ id: t.id, name: t.name, to: t.to?.name }));
    });
    const link = (k) => ({ key: k, url: `${base}/browse/${k}` });
    defineTool(ctx, "jira_create_issue", {
        description: "Create an issue. Use jira_get_create_meta first to learn required fields. Description is Jira wiki markup.",
        input: { projectKey: z.string().trim().min(1), issueType: z.string().min(1).describe("Issue type name"), ...issueFieldInput, summary: z.string().min(1) },
        write: true,
    }, async ({ projectKey, issueType, ...rest }) => {
        const fields = { project: { key: projectKey.toUpperCase() }, issuetype: { name: issueType }, ...buildIssueFields(rest) };
        const res = await client.post("/rest/api/2/issue", { fields });
        return link(res.key);
    });
    defineTool(ctx, "jira_update_issue", { description: "Update fields of an issue; only the given fields change.", input: { issueKey: key, ...issueFieldInput }, write: true }, async ({ issueKey: k, ...rest }) => {
        const fields = buildIssueFields(rest);
        if (Object.keys(fields).length === 0)
            throw new Error("Cần ít nhất một field để cập nhật.");
        const id = issueKey(k);
        await client.put(`/rest/api/2/issue/${id}`, { fields });
        return link(id);
    });
    defineTool(ctx, "jira_assign_issue", {
        description: "Assign an issue to a user (username from jira_search_users), or null to unassign.",
        input: { issueKey: key, assignee: z.string().nullable() },
        write: true,
    }, async (args) => {
        await client.put(`/rest/api/2/issue/${issueKey(args.issueKey)}/assignee`, { name: args.assignee });
        return undefined;
    });
    defineTool(ctx, "jira_transition_issue", {
        description: "Move an issue through its workflow by transition id or name (see jira_get_transitions). Optionally add a comment and resolution.",
        input: {
            issueKey: key,
            transition: z.string().min(1).describe("Transition id or name"),
            comment: z.string().optional(),
            resolution: z.string().optional().describe("Resolution name, e.g. Done"),
            fields: z.record(z.unknown()).optional().describe("Extra fields required by the transition screen"),
        },
        write: true,
    }, async (args) => {
        const id = issueKey(args.issueKey);
        const { transitions } = await client.get(`/rest/api/2/issue/${id}/transitions`);
        const wanted = args.transition.trim().toLowerCase();
        const t = transitions.find((x) => x.id === args.transition.trim()) ?? transitions.find((x) => x.name.toLowerCase() === wanted);
        if (!t) {
            const valid = transitions.map((x) => `${x.name} (${x.id})`).join(", ");
            throw new Error(`Không có transition "${args.transition.trim()}" cho ${id}. Các transition hợp lệ: ${valid}`);
        }
        const fields = { ...args.fields, ...(args.resolution ? { resolution: { name: args.resolution } } : {}) };
        await client.post(`/rest/api/2/issue/${id}/transitions`, {
            transition: { id: t.id },
            ...(Object.keys(fields).length ? { fields } : {}),
            ...(args.comment ? { update: { comment: [{ add: { body: args.comment } }] } } : {}),
        });
        return { ...link(id), status: t.to?.name };
    });
}
