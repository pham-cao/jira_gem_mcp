import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register } from "../src/tools/worklogs.js";
import { user } from "./fixtures.js";
import { API, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = () => connectTools([register]);

describe("worklog tools", () => {
  it("jira_get_worklogs", async () => {
    mswServer.use(
      http.get(`${API}/issue/ABC-1/worklog`, () =>
        HttpResponse.json({
          startAt: 0,
          maxResults: 1,
          total: 1,
          worklogs: [{ id: "5", author: user("bob"), timeSpent: "2h", timeSpentSeconds: 7200, started: "s", comment: "c", self: "x" }],
        }),
      ),
    );
    const out = await (await h()).json("jira_get_worklogs", { issueKey: "ABC-1" });
    expect(out.items).toEqual([{ id: "5", author: { name: "bob", displayName: "BOB" }, timeSpent: "2h", timeSpentSeconds: 7200, started: "s", comment: "c" }]);
  });

  it("jira_add_worklog converts started and passes estimate params", async () => {
    let body: unknown;
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.post(`${API}/issue/ABC-1/worklog`, async ({ request }) => {
        body = await request.json();
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ id: "8", timeSpent: "2h 30m", started: "2026-10-08T09:00:00.000+0700" }, { status: 201 });
      }),
    );
    const out = await (await h()).json("jira_add_worklog", {
      issueKey: "abc-1",
      timeSpent: "2h 30m",
      started: "2026-10-08T09:00:00+07:00",
      comment: "work",
      adjustEstimate: "new",
      newEstimate: "1d",
    });
    expect(body).toEqual({ timeSpent: "2h 30m", started: "2026-10-08T09:00:00.000+0700", comment: "work" });
    expect(Object.fromEntries(params!)).toEqual({ adjustEstimate: "new", newEstimate: "1d" });
    expect(out).toEqual({ id: "8", timeSpent: "2h 30m", started: "2026-10-08T09:00:00.000+0700" });
  });

  it("requires newEstimate with adjustEstimate=new and reduceBy with manual", async () => {
    let calls = 0;
    mswServer.use(http.post(`${API}/issue/ABC-1/worklog`, () => (calls++, HttpResponse.json({}))));
    const c = await h();
    expect((await c.call("jira_add_worklog", { issueKey: "ABC-1", timeSpent: "1h", adjustEstimate: "new" })).isError).toBe(true);
    expect((await c.call("jira_add_worklog", { issueKey: "ABC-1", timeSpent: "1h", adjustEstimate: "manual" })).isError).toBe(true);
    expect(calls).toBe(0);
  });

  it("hides write tools in read-only mode", async () => {
    expect(await (await connectTools([register], { readOnly: true })).toolNames()).toEqual(["jira_get_worklogs"]);
  });
});
