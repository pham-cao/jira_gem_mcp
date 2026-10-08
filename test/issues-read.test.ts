import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register } from "../src/tools/issues.js";
import { fieldsHandler, SPRINT_FIELD, user } from "./fixtures.js";
import { API, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = () => connectTools([register]);

describe("jira_search", () => {
  it("sends the default body and returns paged slim issues", async () => {
    let body: unknown;
    mswServer.use(
      http.post(`${API}/search`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          startAt: 0,
          maxResults: 20,
          total: 30,
          issues: [{ key: "ABC-1", fields: { summary: "S", status: { name: "Open" }, assignee: null } }],
        });
      }),
    );
    const out = await (await h()).json("jira_search", { jql: "project = ABC" });
    expect(body).toEqual({
      jql: "project = ABC",
      startAt: 0,
      maxResults: 20,
      fields: ["summary", "status", "assignee", "issuetype", "priority", "updated"],
    });
    expect(out).toEqual({
      items: [{ key: "ABC-1", url: "https://jira.test/ctx/browse/ABC-1", summary: "S", status: "Open", assignee: null }],
      total: 30,
      startAt: 0,
      maxResults: 20,
      hasMore: true,
    });
  });

  it("rejects maxResults over 100", async () => {
    expect((await (await h()).call("jira_search", { jql: "x", maxResults: 101 })).isError).toBe(true);
  });
});

describe("jira_get_issue", () => {
  it("normalises the key and returns full detail with sprint", async () => {
    let url = "";
    mswServer.use(
      fieldsHandler,
      http.get(`${API}/issue/ABC-1`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({
          key: "ABC-1",
          fields: {
            summary: "S",
            reporter: user("rep"),
            comment: { total: 12, comments: Array.from({ length: 12 }, (_, i) => ({ id: String(i), author: user("c"), body: "b" })) },
            [SPRINT_FIELD]: ["com.atlassian.greenhopper.service.sprint.Sprint@1[id=5,rapidViewId=1,state=ACTIVE,name=S5,startDate=x]"],
          },
        });
      }),
    );
    const out = await (await h()).json("jira_get_issue", { issueKey: " abc-1 ", expand: ["changelog", "renderedFields"] });
    expect(new URL(url).searchParams.get("expand")).toBe("changelog,renderedFields");
    expect(out.sprint).toEqual([{ id: 5, name: "S5", state: "ACTIVE" }]);
    expect(out.comments).toHaveLength(10);
    expect(out.reporter).toEqual({ name: "rep", displayName: "REP" });
  });

  it("maps 404 to a readable message", async () => {
    mswServer.use(fieldsHandler, http.get(`${API}/issue/ABC-1`, () => HttpResponse.json({ errorMessages: ["x"] }, { status: 404 })));
    expect(await (await h()).text("jira_get_issue", { issueKey: "ABC-1" })).toBe(
      "Không tìm thấy GET /rest/api/2/issue/ABC-1 hoặc không có quyền xem.",
    );
  });
});

describe("jira_get_transitions", () => {
  it("returns id, name and target status", async () => {
    mswServer.use(
      http.get(`${API}/issue/ABC-1/transitions`, () =>
        HttpResponse.json({ transitions: [{ id: "21", name: "In Progress", to: { name: "In Progress", self: "s" } }] }),
      ),
    );
    expect(await (await h()).json("jira_get_transitions", { issueKey: "abc-1" })).toEqual([{ id: "21", name: "In Progress", to: "In Progress" }]);
  });
});
