import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register } from "../src/tools/meta.js";
import { API, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = () => connectTools([register]);

describe("meta tools", () => {
  it("jira_list_projects", async () => {
    mswServer.use(http.get(`${API}/project`, () => HttpResponse.json([{ self: "s", id: "1", key: "ABC", name: "Abc", avatarUrls: {} }])));
    expect(await (await h()).json("jira_list_projects")).toEqual([{ id: "1", key: "ABC", name: "Abc" }]);
  });

  it("jira_get_create_meta", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${API}/issue/createmeta`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({
          projects: [
            {
              key: "ABC",
              issuetypes: [
                {
                  name: "Bug",
                  fields: {
                    summary: { name: "Summary", required: true },
                    priority: { name: "Priority", required: false, allowedValues: [{ name: "High" }, { name: "Low" }] },
                    customfield_1: { name: "Env", required: false, allowedValues: [{ value: "Prod" }] },
                  },
                },
              ],
            },
          ],
        });
      }),
    );
    const out = await (await h()).json("jira_get_create_meta", { projectKey: "ABC", issueType: "Bug" });
    expect(params?.get("projectKeys")).toBe("ABC");
    expect(params?.get("issuetypeNames")).toBe("Bug");
    expect(params?.get("expand")).toBe("projects.issuetypes.fields");
    expect(out).toEqual([
      {
        issueType: "Bug",
        fields: [
          { id: "summary", name: "Summary", required: true },
          { id: "priority", name: "Priority", required: false, allowedValues: ["High", "Low"] },
          { id: "customfield_1", name: "Env", required: false, allowedValues: ["Prod"] },
        ],
      },
    ]);
  });

  it("jira_get_create_meta errors on unknown project", async () => {
    mswServer.use(http.get(`${API}/issue/createmeta`, () => HttpResponse.json({ projects: [] })));
    const r = await (await h()).call("jira_get_create_meta", { projectKey: "NOPE" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("NOPE");
  });

  it("jira_search_fields filters by id or name", async () => {
    mswServer.use(
      http.get(`${API}/field`, () =>
        HttpResponse.json([
          { id: "customfield_10006", name: "Story Points", custom: true, schema: { type: "number" } },
          { id: "summary", name: "Summary", custom: false, schema: { type: "string" } },
        ]),
      ),
    );
    const out = await (await h()).json("jira_search_fields", { query: "story" });
    expect(out).toEqual([{ id: "customfield_10006", name: "Story Points", custom: true, type: "number" }]);
  });

  it("jira_search_users sends unicode username", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${API}/user/search`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([{ self: "s", name: "nva", displayName: "Nguyễn Văn A", emailAddress: "a@x", active: true, avatarUrls: {} }]);
      }),
    );
    const out = await (await h()).json("jira_search_users", { query: "Nguyễn" });
    expect(params?.get("username")).toBe("Nguyễn");
    expect(params?.get("maxResults")).toBe("20");
    expect(out).toEqual([{ name: "nva", displayName: "Nguyễn Văn A", emailAddress: "a@x", active: true }]);
  });

  it("jira_list_link_types", async () => {
    mswServer.use(
      http.get(`${API}/issueLinkType`, () =>
        HttpResponse.json({ issueLinkTypes: [{ id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks", self: "s" }] }),
      ),
    );
    expect(await (await h()).json("jira_list_link_types")).toEqual([{ id: "1", name: "Blocks", inward: "is blocked by", outward: "blocks" }]);
  });
});
