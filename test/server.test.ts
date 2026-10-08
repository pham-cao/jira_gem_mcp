import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { JiraError } from "../src/jira/errors.js";
import { createServer, startupChecks } from "../src/server.js";
import { AGILE, API, connectServer, makeClient, mswServer, useMsw } from "./helpers.js";

useMsw();

const READ = [
  "jira_download_attachment",
  "jira_get_comments",
  "jira_get_create_meta",
  "jira_get_issue",
  "jira_get_transitions",
  "jira_get_worklogs",
  "jira_list_link_types",
  "jira_list_projects",
  "jira_search",
  "jira_search_fields",
  "jira_search_users",
];
const WRITE = [
  "jira_add_comment",
  "jira_add_worklog",
  "jira_assign_issue",
  "jira_create_issue",
  "jira_link_issues",
  "jira_transition_issue",
  "jira_update_comment",
  "jira_update_issue",
  "jira_upload_attachment",
];
const AGILE_READ = ["jira_get_sprint_issues", "jira_list_boards", "jira_list_sprints"];
const AGILE_WRITE = ["jira_create_sprint", "jira_move_issues_to_sprint", "jira_update_sprint"];
const sorted = (...xs: string[][]) => xs.flat().sort();

describe("startupChecks", () => {
  it("returns the user and agile availability", async () => {
    mswServer.use(
      http.get(`${API}/myself`, () => HttpResponse.json({ name: "alice", displayName: "Alice", self: "s" })),
      http.get(`${AGILE}/board`, () => HttpResponse.json({ values: [] })),
    );
    expect(await startupChecks(makeClient())).toEqual({ user: { name: "alice", displayName: "Alice" }, agile: true });
  });

  it("reports agile off when the board endpoint 404s", async () => {
    mswServer.use(
      http.get(`${API}/myself`, () => HttpResponse.json({ name: "alice", displayName: "Alice" })),
      http.get(`${AGILE}/board`, () => new HttpResponse(null, { status: 404 })),
    );
    expect((await startupChecks(makeClient())).agile).toBe(false);
  });

  it("throws a captcha JiraError after a single /myself request", async () => {
    let calls = 0;
    mswServer.use(
      http.get(`${API}/myself`, () => {
        calls++;
        return new HttpResponse(null, { status: 401, headers: { "X-Authentication-Denied-Reason": "CAPTCHA_CHALLENGE; login-url=x" } });
      }),
    );
    const err = await startupChecks(makeClient()).catch((e) => e);
    expect(err).toBeInstanceOf(JiraError);
    expect(err.captcha).toBe(true);
    expect(calls).toBe(1);
  });
});

describe("createServer", () => {
  const names = async (opts: { readOnly: boolean; agile: boolean }) => (await connectServer(createServer(makeClient(), opts))).toolNames();

  it("registers all 26 tools", async () => {
    const all = await names({ readOnly: false, agile: true });
    expect(all).toEqual(sorted(READ, WRITE, AGILE_READ, AGILE_WRITE));
    expect(all).toHaveLength(26);
  });

  it("registers only the 14 read tools in read-only mode", async () => {
    const r = await names({ readOnly: true, agile: true });
    expect(r).toEqual(sorted(READ, AGILE_READ));
    expect(r).toHaveLength(14);
  });

  it("omits agile tools when agile is off", async () => {
    expect(await names({ readOnly: false, agile: false })).toEqual(sorted(READ, WRITE));
  });
});
