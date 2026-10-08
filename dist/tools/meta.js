import { z } from "zod";
import { defineTool } from "./define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */
export function register(ctx) {
    const { client } = ctx;
    defineTool(ctx, "jira_list_projects", { description: "List Jira projects visible to the current user.", input: {} }, async () => {
        const projects = await client.get("/rest/api/2/project");
        return projects.map((p) => ({ id: p.id, key: p.key, name: p.name }));
    });
    defineTool(ctx, "jira_get_create_meta", {
        description: "Show issue types and their fields (id, required, allowed values) for creating issues in a project. Use before jira_create_issue to learn required/custom fields.",
        input: { projectKey: z.string().trim().min(1), issueType: z.string().optional().describe("Issue type name, e.g. Bug") },
    }, async ({ projectKey, issueType }) => {
        const key = projectKey.toUpperCase();
        const res = await client.get("/rest/api/2/issue/createmeta", {
            projectKeys: key,
            issuetypeNames: issueType,
            expand: "projects.issuetypes.fields",
        });
        const project = res.projects?.[0];
        if (!project)
            throw new Error(`Không tìm thấy project ${key} hoặc bạn không có quyền tạo issue trong project này.`);
        return project.issuetypes.map((t) => ({
            issueType: t.name,
            fields: Object.entries(t.fields ?? {}).map(([id, f]) => ({
                id,
                name: f.name,
                required: f.required,
                ...(Array.isArray(f.allowedValues) && f.allowedValues.length
                    ? { allowedValues: f.allowedValues.slice(0, 50).map((v) => v.name ?? v.value ?? v.key ?? String(v.id)) }
                    : {}),
            })),
        }));
    });
    defineTool(ctx, "jira_search_fields", {
        description: 'Find field ids by name or id, e.g. "Story Points" → customfield_10006. Use the id in customFields.',
        input: { query: z.string().optional() },
    }, async ({ query }) => {
        const q = query?.trim().toLowerCase() ?? "";
        return (await ctx.fields.all())
            .filter((f) => !q || f.id.toLowerCase().includes(q) || f.name.toLowerCase().includes(q))
            .map((f) => ({ id: f.id, name: f.name, custom: f.custom, type: f.schema?.type }));
    });
    defineTool(ctx, "jira_search_users", {
        description: "Find users by username, name or email. Use the returned `name` (username) for assignee fields.",
        input: { query: z.string().trim().min(1), maxResults: z.number().int().min(1).max(100).default(20) },
    }, async ({ query, maxResults }) => {
        const users = await client.get("/rest/api/2/user/search", { username: query, maxResults });
        return users.map((u) => ({ name: u.name, displayName: u.displayName, emailAddress: u.emailAddress, active: u.active }));
    });
    defineTool(ctx, "jira_list_link_types", { description: "List issue link types (name, inward, outward).", input: {} }, async () => {
        const res = await client.get("/rest/api/2/issueLinkType");
        return (res.issueLinkTypes ?? []).map((t) => ({ id: t.id, name: t.name, inward: t.inward, outward: t.outward }));
    });
}
