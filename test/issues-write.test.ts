import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register } from "../src/tools/issues.js";
import { API, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = () => connectTools([register]);

function capture(method: "post" | "put", path: string, response: () => Response) {
  const seen: { body?: unknown; calls: number } = { calls: 0 };
  mswServer.use(
    http[method](path, async ({ request }) => {
      seen.calls++;
      const t = await request.text();
      seen.body = t ? JSON.parse(t) : undefined;
      return response();
    }),
  );
  return seen;
}

describe("jira_create_issue", () => {
  it("sends the exact create body", async () => {
    const seen = capture("post", `${API}/issue`, () => HttpResponse.json({ id: "1", key: "ABC-7" }, { status: 201 }));
    const out = await (await h()).json("jira_create_issue", {
      projectKey: "abc",
      issueType: "Sub-task",
      summary: "S",
      description: "*bold*",
      assignee: "bob",
      priority: "High",
      labels: ["a"],
      parentKey: "abc-1",
      customFields: { customfield_10006: 5 },
    });
    expect(seen.body).toEqual({
      fields: {
        project: { key: "ABC" },
        issuetype: { name: "Sub-task" },
        summary: "S",
        description: "*bold*",
        assignee: { name: "bob" },
        priority: { name: "High" },
        labels: ["a"],
        parent: { key: "ABC-1" },
        customfield_10006: 5,
      },
    });
    expect(out).toEqual({ key: "ABC-7", url: "https://jira.test/ctx/browse/ABC-7" });
  });

  it("reports field errors", async () => {
    capture("post", `${API}/issue`, () => HttpResponse.json({ errorMessages: [], errors: { customfield_10006: "Number value expected" } }, { status: 400 }));
    const text = await (await h()).text("jira_create_issue", { projectKey: "ABC", issueType: "Bug", summary: "S" });
    expect(text).toContain("- customfield_10006: Number value expected");
  });
});

describe("jira_update_issue", () => {
  it("rejects an update with no fields without calling Jira", async () => {
    const seen = capture("put", `${API}/issue/ABC-1`, () => new HttpResponse(null, { status: 204 }));
    const r = await (await h()).call("jira_update_issue", { issueKey: "ABC-1" });
    expect(r.isError).toBe(true);
    expect(seen.calls).toBe(0);
  });

  it("sends only the given fields", async () => {
    const seen = capture("put", `${API}/issue/ABC-1`, () => new HttpResponse(null, { status: 204 }));
    const out = await (await h()).json("jira_update_issue", { issueKey: "abc-1", summary: "New", labels: [] });
    expect(seen.body).toEqual({ fields: { summary: "New", labels: [] } });
    expect(out).toEqual({ key: "ABC-1", url: "https://jira.test/ctx/browse/ABC-1" });
  });
});

describe("jira_assign_issue", () => {
  it("unassigns with null", async () => {
    const seen = capture("put", `${API}/issue/ABC-1/assignee`, () => new HttpResponse(null, { status: 204 }));
    expect(await (await h()).json("jira_assign_issue", { issueKey: "ABC-1", assignee: null })).toEqual({ ok: true });
    expect(seen.body).toEqual({ name: null });
  });
});

describe("jira_transition_issue", () => {
  const transitions = () =>
    mswServer.use(
      http.get(`${API}/issue/ABC-1/transitions`, () =>
        HttpResponse.json({
          transitions: [
            { id: "11", name: "To Do", to: { name: "To Do" } },
            { id: "21", name: "In Progress", to: { name: "In Progress" } },
          ],
        }),
      ),
    );

  it("matches by name case-insensitively and sends comment + resolution", async () => {
    transitions();
    const seen = capture("post", `${API}/issue/ABC-1/transitions`, () => new HttpResponse(null, { status: 204 }));
    const out = await (await h()).json("jira_transition_issue", { issueKey: "ABC-1", transition: " in progress ", comment: "go", resolution: "Done" });
    expect(seen.body).toEqual({
      transition: { id: "21" },
      fields: { resolution: { name: "Done" } },
      update: { comment: [{ add: { body: "go" } }] },
    });
    expect(out).toEqual({ key: "ABC-1", url: "https://jira.test/ctx/browse/ABC-1", status: "In Progress" });
  });

  it("matches by id with no optional parts", async () => {
    transitions();
    const seen = capture("post", `${API}/issue/ABC-1/transitions`, () => new HttpResponse(null, { status: 204 }));
    await (await h()).json("jira_transition_issue", { issueKey: "ABC-1", transition: "11" });
    expect(seen.body).toEqual({ transition: { id: "11" } });
  });

  it("lists valid transitions when the name is unknown", async () => {
    transitions();
    expect(await (await h()).text("jira_transition_issue", { issueKey: "ABC-1", transition: "Done" })).toBe(
      'Không có transition "Done" cho ABC-1. Các transition hợp lệ: To Do (11), In Progress (21)',
    );
  });
});

it("write tools are hidden in read-only mode", async () => {
  const names = await (await connectTools([register], { readOnly: true })).toolNames();
  expect(names).toEqual(["jira_get_issue", "jira_get_transitions", "jira_search"]);
});
