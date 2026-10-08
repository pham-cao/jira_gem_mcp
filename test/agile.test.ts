import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register } from "../src/tools/agile.js";
import { AGILE, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = () => connectTools([register]);

function capture(method: "get" | "post", path: string, respond: () => Response) {
  const seen: { params?: Record<string, string>; body?: unknown; calls: number } = { calls: 0 };
  mswServer.use(
    http[method](path, async ({ request }) => {
      seen.calls++;
      seen.params = Object.fromEntries(new URL(request.url).searchParams);
      const t = method === "post" ? await request.text() : "";
      seen.body = t ? JSON.parse(t) : undefined;
      return respond();
    }),
  );
  return seen;
}

describe("agile read tools", () => {
  it("jira_list_boards maps isLast to hasMore", async () => {
    const seen = capture("get", `${AGILE}/board`, () =>
      HttpResponse.json({ startAt: 0, maxResults: 50, isLast: false, values: [{ id: 3306, name: "Main Board", type: "scrum", self: "s" }] }),
    );
    const out = await (await h()).json("jira_list_boards", { projectKey: "tdisgsai", type: "scrum" });
    expect(seen.params).toEqual({ projectKeyOrId: "TDISGSAI", type: "scrum", startAt: "0", maxResults: "50" });
    expect(out).toEqual({ items: [{ id: 3306, name: "Main Board", type: "scrum" }], total: null, startAt: 0, maxResults: 50, hasMore: true });
  });

  it("jira_list_sprints defaults to active,future", async () => {
    const seen = capture("get", `${AGILE}/board/3306/sprint`, () =>
      HttpResponse.json({
        startAt: 0,
        maxResults: 50,
        isLast: true,
        values: [{ id: 5651, name: "D3", state: "future", originBoardId: 3306, goal: "g", self: "s" }],
      }),
    );
    const out = await (await h()).json("jira_list_sprints", { boardId: 3306 });
    expect(seen.params?.state).toBe("active,future");
    expect(out.hasMore).toBe(false);
    expect(out.items).toEqual([{ id: 5651, name: "D3", state: "future", goal: "g", boardId: 3306 }]);
  });

  it("jira_get_sprint_issues", async () => {
    const seen = capture("get", `${AGILE}/sprint/5651/issue`, () =>
      HttpResponse.json({ startAt: 0, maxResults: 20, total: 1, issues: [{ key: "A-1", fields: { summary: "S", status: { name: "Open" } } }] }),
    );
    const out = await (await h()).json("jira_get_sprint_issues", { sprintId: 5651, jql: "assignee = currentUser()" });
    expect(seen.params).toEqual({
      jql: "assignee = currentUser()",
      fields: "summary,status,assignee,issuetype,priority,updated",
      startAt: "0",
      maxResults: "20",
    });
    expect(out.items).toEqual([{ key: "A-1", url: "https://jira.test/ctx/browse/A-1", summary: "S", status: "Open" }]);
  });
});

describe("agile write tools", () => {
  it("jira_move_issues_to_sprint upper-cases keys", async () => {
    const seen = capture("post", `${AGILE}/sprint/9/issue`, () => new HttpResponse(null, { status: 204 }));
    expect(await (await h()).json("jira_move_issues_to_sprint", { sprintId: 9, issueKeys: ["a-1", "A-2"] })).toEqual({ ok: true });
    expect(seen.body).toEqual({ issues: ["A-1", "A-2"] });
  });

  it("rejects more than 50 keys", async () => {
    const keys = Array.from({ length: 51 }, (_, i) => `A-${i}`);
    expect((await (await h()).call("jira_move_issues_to_sprint", { sprintId: 9, issueKeys: keys })).isError).toBe(true);
  });

  it("jira_create_sprint", async () => {
    const seen = capture("post", `${AGILE}/sprint`, () => HttpResponse.json({ id: 10, name: "N", state: "future", originBoardId: 3306 }, { status: 201 }));
    const out = await (await h()).json("jira_create_sprint", { boardId: 3306, name: "N", goal: "g" });
    expect(seen.body).toEqual({ originBoardId: 3306, name: "N", goal: "g" });
    expect(out).toEqual({ id: 10, name: "N", state: "future", boardId: 3306 });
  });

  it("jira_update_sprint sends only given keys", async () => {
    const seen = capture("post", `${AGILE}/sprint/10`, () => HttpResponse.json({ id: 10, name: "N", state: "active" }));
    await (await h()).json("jira_update_sprint", { sprintId: 10, state: "active", endDate: "2026-10-20T00:00:00+07:00" });
    expect(seen.body).toEqual({ state: "active", endDate: "2026-10-20T00:00:00+07:00" });
  });

  it("jira_update_sprint rejects an empty update", async () => {
    const seen = capture("post", `${AGILE}/sprint/10`, () => HttpResponse.json({}));
    expect((await (await h()).call("jira_update_sprint", { sprintId: 10 })).isError).toBe(true);
    expect(seen.calls).toBe(0);
  });

  it("are hidden in read-only mode", async () => {
    expect(await (await connectTools([register], { readOnly: true })).toolNames()).toEqual([
      "jira_get_sprint_issues",
      "jira_list_boards",
      "jira_list_sprints",
    ]);
  });
});
