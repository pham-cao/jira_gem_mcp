import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { HttpError, formatError } from "../src/http/errors.js";
import { JiraError } from "../src/jira/errors.js";
import { checkConfluence, confluenceStartup, createServer, startupChecks } from "../src/server.js";
import { AGILE, API, CAPI, connectServer, makeClient, makeConfluenceClient, mswServer, useMsw } from "./helpers.js";

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
const CONF_READ = [
  "confluence_download_attachment",
  "confluence_get_comments",
  "confluence_get_labels",
  "confluence_get_page",
  "confluence_get_page_children",
  "confluence_list_attachments",
  "confluence_list_spaces",
  "confluence_search",
];
const CONF_WRITE = ["confluence_add_comment", "confluence_add_labels", "confluence_create_page", "confluence_update_page", "confluence_upload_attachment"];
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

describe("createServer with Confluence", () => {
  const names = async (readOnly: boolean) =>
    (await connectServer(createServer(makeClient(), { readOnly, agile: true, confluence: makeConfluenceClient() }))).toolNames();

  it("registers all 39 tools", async () => {
    const all = await names(false);
    expect(all).toEqual(sorted(READ, WRITE, AGILE_READ, AGILE_WRITE, CONF_READ, CONF_WRITE));
    expect(all).toHaveLength(39);
  });

  it("registers 22 read tools in read-only mode", async () => {
    const r = await names(true);
    expect(r).toEqual(sorted(READ, AGILE_READ, CONF_READ));
    expect(r).toHaveLength(22);
  });
});

describe("checkConfluence", () => {
  it("returns the username for a known user", async () => {
    mswServer.use(http.get(`${CAPI}/user/current`, () => HttpResponse.json({ type: "known", username: "alice" })));
    expect(await checkConfluence(makeConfluenceClient())).toEqual({ name: "alice" });
  });

  it("rejects for an anonymous session", async () => {
    mswServer.use(http.get(`${CAPI}/user/current`, () => HttpResponse.json({ type: "anonymous" })));
    await expect(checkConfluence(makeConfluenceClient())).rejects.toThrow(
      "Đăng nhập Confluence thất bại (sai username/password hoặc tài khoản bị khoá/CAPTCHA).",
    );
  });

  it("propagates a 401 as HttpError for Confluence", async () => {
    mswServer.use(http.get(`${CAPI}/user/current`, () => new HttpResponse(null, { status: 401 })));
    const err = await checkConfluence(makeConfluenceClient()).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.service).toBe("Confluence");
  });
});

describe("confluenceStartup", () => {
  it("names Confluence when the login check fails with HTTP 401", async () => {
    mswServer.use(http.get(`${CAPI}/user/current`, () => new HttpResponse(null, { status: 401 })));
    const err = await confluenceStartup(makeConfluenceClient()).catch((e) => e);
    expect(err.message).toBe("Đăng nhập Confluence thất bại: Xác thực thất bại: sai username/password.");
    expect(formatError(err)).toMatch(/^Đăng nhập Confluence thất bại: /);
  });

  it("keeps the anonymous-session copy", async () => {
    mswServer.use(http.get(`${CAPI}/user/current`, () => HttpResponse.json({ type: "anonymous" })));
    const err = await confluenceStartup(makeConfluenceClient()).catch((e) => e);
    expect(formatError(err)).toBe("Đăng nhập Confluence thất bại (sai username/password hoặc tài khoản bị khoá/CAPTCHA).");
  });

  it("returns the username on success", async () => {
    mswServer.use(http.get(`${CAPI}/user/current`, () => HttpResponse.json({ type: "known", username: "alice" })));
    expect(await confluenceStartup(makeConfluenceClient())).toEqual({ name: "alice" });
  });
});
