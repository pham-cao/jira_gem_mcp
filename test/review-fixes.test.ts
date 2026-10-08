import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { formatError } from "../src/jira/errors.js";
import { slimIssue } from "../src/jira/format.js";
import * as attachments from "../src/tools/attachments.js";
import * as issues from "../src/tools/issues.js";
import { fieldsHandler, user } from "./fixtures.js";
import { API, connectTools, makeClient, mswServer, useMsw } from "./helpers.js";

useMsw();

describe("review fix: 2xx non-JSON body", () => {
  it("explains an HTML 200 response instead of throwing SyntaxError", async () => {
    mswServer.use(http.get(`${API}/myself`, () => new HttpResponse("<!DOCTYPE html><html>login</html>", { headers: { "Content-Type": "text/html" } })));
    const err = await makeClient().get("/rest/api/2/myself").catch((e) => e);
    expect(err).not.toBeInstanceOf(SyntaxError);
    expect(formatError(err)).toBe(
      "Jira trả về nội dung không phải JSON (HTTP 200, text/html) cho GET /rest/api/2/myself — có thể bị chuyển hướng tới trang đăng nhập/SSO hoặc proxy.",
    );
  });
});

describe("review fix: network error causes", () => {
  it("includes the cause code", () => {
    const e = new TypeError("fetch failed", { cause: Object.assign(new Error("getaddrinfo ENOTFOUND x"), { code: "ENOTFOUND" }) });
    expect(formatError(e)).toBe("Lỗi kết nối tới Jira: fetch failed (ENOTFOUND: getaddrinfo ENOTFOUND x)");
  });

  it("hints JIRA_INSECURE_TLS for certificate errors", () => {
    const e = new TypeError("fetch failed", { cause: Object.assign(new Error("self-signed certificate in certificate chain"), { code: "SELF_SIGNED_CERT_IN_CHAIN" }) });
    expect(formatError(e)).toContain("JIRA_INSECURE_TLS=true");
  });

  it("explains timeouts", () => {
    const e = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    expect(formatError(e)).toBe("Jira không phản hồi trong thời gian cho phép (JIRA_TIMEOUT_MS).");
  });
});

describe("review fix: expand output", () => {
  it("slimIssue passes through a slim changelog and rendered description", () => {
    const out = slimIssue(
      {
        key: "A-1",
        fields: { summary: "S" },
        renderedFields: { description: "<p>d</p>" },
        changelog: {
          histories: [{ id: "1", author: { name: "bob", displayName: "Bob" }, created: "t", items: [{ field: "status", fromString: "Open", toString: "Done", from: "1" }] }],
        },
      },
      { baseUrl: "https://j", full: true },
    );
    expect(out.changelog).toEqual([{ author: { name: "bob", displayName: "Bob" }, created: "t", items: [{ field: "status", from: "Open", to: "Done" }] }]);
    expect(out.renderedDescription).toBe("<p>d</p>");
  });
});

describe("review fix: requested and standard fields are kept", () => {
  it("jira_search returns explicitly requested fields, slimmed", async () => {
    mswServer.use(
      fieldsHandler,
      http.post(`${API}/search`, () =>
        HttpResponse.json({
          startAt: 0,
          maxResults: 20,
          total: 1,
          issues: [
            {
              key: "A-1",
              fields: {
                summary: "S",
                labels: ["x"],
                duedate: "2026-10-20",
                components: [{ id: "1", name: "API", self: "s" }],
                customfield_20000: { value: "High", id: "3", self: "s" },
                reporter: user("rep"),
              },
            },
          ],
        }),
      ),
    );
    const h = await connectTools([issues.register]);
    const out = await h.json("jira_search", { jql: "x", fields: ["summary", "labels", "duedate", "components", "customfield_20000", "reporter"] });
    expect(out.items[0]).toMatchObject({
      labels: ["x"],
      duedate: "2026-10-20",
      components: ["API"],
      customfield_20000: "High",
      reporter: { name: "rep", displayName: "REP" },
    });
  });

  it("full issue includes due date, versions, components, time tracking and object custom fields", () => {
    const out = slimIssue(
      {
        key: "A-1",
        fields: {
          duedate: "d",
          fixVersions: [{ name: "1.0" }],
          components: [{ name: "API" }],
          timetracking: { originalEstimate: "1d", remainingEstimate: "4h", timeSpent: "4h", originalEstimateSeconds: 1 },
          customfield_1: { value: "Prod" },
          customfield_2: null,
        },
      },
      { baseUrl: "https://j", full: true },
    );
    expect(out).toMatchObject({
      duedate: "d",
      fixVersions: ["1.0"],
      components: ["API"],
      timetracking: { originalEstimate: "1d", remainingEstimate: "4h", timeSpent: "4h" },
      customfield_1: "Prod",
    });
    expect(out).not.toHaveProperty("customfield_2");
  });
});

describe("review fix: download is not advertised as read-only", () => {
  it("jira_download_attachment has readOnlyHint false but stays in read-only mode", async () => {
    const h = await connectTools([attachments.register], { readOnly: true });
    const tool = (await h.client.listTools()).tools.find((t) => t.name === "jira_download_attachment");
    expect(tool?.annotations?.readOnlyHint).toBe(false);
  });
});
