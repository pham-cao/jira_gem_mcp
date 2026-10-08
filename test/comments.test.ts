import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { MAX_TEXT } from "../src/jira/format.js";
import { register } from "../src/tools/comments.js";
import { user } from "./fixtures.js";
import { API, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = () => connectTools([register]);

describe("comment tools", () => {
  it("jira_get_comments pages and truncates long bodies", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${API}/issue/ABC-1/comment`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({
          startAt: 0,
          maxResults: 50,
          total: 1,
          comments: [{ id: "9", author: user("bob"), body: "x".repeat(MAX_TEXT + 5), created: "c", updated: "u" }],
        });
      }),
    );
    const out = await (await h()).json("jira_get_comments", { issueKey: "abc-1" });
    expect(Object.fromEntries(params!)).toEqual({ startAt: "0", maxResults: "50", orderBy: "created" });
    expect(out.hasMore).toBe(false);
    expect(out.items[0].author).toEqual({ name: "bob", displayName: "BOB" });
    expect(out.items[0].body).toContain("…[truncated]");
  });

  it("jira_add_comment returns id and focused url", async () => {
    let body: unknown;
    mswServer.use(
      http.post(`${API}/issue/ABC-1/comment`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "77" }, { status: 201 });
      }),
    );
    const out = await (await h()).json("jira_add_comment", { issueKey: "ABC-1", body: "hi" });
    expect(body).toEqual({ body: "hi" });
    expect(out).toEqual({ id: "77", url: "https://jira.test/ctx/browse/ABC-1?focusedCommentId=77" });
  });

  it("jira_update_comment", async () => {
    let body: unknown;
    mswServer.use(
      http.put(`${API}/issue/ABC-1/comment/77`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "77" });
      }),
    );
    expect(await (await h()).json("jira_update_comment", { issueKey: "ABC-1", commentId: "77", body: "edit" })).toEqual({ id: "77" });
    expect(body).toEqual({ body: "edit" });
  });

  it("hides write tools in read-only mode", async () => {
    expect(await (await connectTools([register], { readOnly: true })).toolNames()).toEqual(["jira_get_comments"]);
  });
});
