/* eslint-disable @typescript-eslint/no-explicit-any */
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register as registerComments } from "../src/tools/confluence/comments.js";
import { register as registerLabels } from "../src/tools/confluence/labels.js";
import { CAPI, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = (opts: { readOnly?: boolean } = {}) => connectTools([registerComments, registerLabels], { ...opts, confluence: true });

const comment = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "comment",
  body: { storage: { value: "<p>Hi <strong>there</strong></p>" } },
  version: { number: 1 },
  history: { createdBy: { username: "alice" }, createdDate: "2026-01-02T00:00:00.000Z" },
  ancestors: [],
  ...extra,
});

describe("confluence comment tools", () => {
  it("confluence_get_comments sends expand/depth and returns Markdown bodies with parentId", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${CAPI}/content/123/child/comment`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({
          results: [comment("10"), comment("11", { ancestors: [{ id: "10" }, { id: "9" }] })],
          start: 0,
          limit: 25,
          size: 2,
        });
      }),
    );
    const out = await (await h()).json("confluence_get_comments", { pageId: "123" });
    expect(Object.fromEntries(params!)).toEqual({ expand: "body.storage,version,history,ancestors", depth: "all", limit: "25", start: "0" });
    expect(out.items[0]).toEqual({ id: "10", author: "alice", created: "2026-01-02T00:00:00.000Z", body: "Hi **there**" });
    expect(out.items[1].parentId).toBe("9");
  });

  it("confluence_add_comment POSTs storage body", async () => {
    let body: any;
    mswServer.use(
      http.post(`${CAPI}/content`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(comment("20"));
      }),
    );
    const out = await (await h()).json("confluence_add_comment", { pageId: "123", body: "**ok**" });
    expect(body).toEqual({
      type: "comment",
      container: { id: "123", type: "page" },
      body: { storage: { value: "<p><strong>ok</strong></p>", representation: "storage" } },
    });
    expect(out.id).toBe("20");
  });

  it("confluence_add_comment adds ancestors for a reply", async () => {
    let body: any;
    mswServer.use(
      http.post(`${CAPI}/content`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(comment("21"));
      }),
    );
    await (await h()).json("confluence_add_comment", { pageId: "123", body: "x", parentCommentId: "55" });
    expect(body.ancestors).toEqual([{ id: "55" }]);
  });
});

describe("confluence label tools", () => {
  it("confluence_get_labels returns name and prefix", async () => {
    mswServer.use(http.get(`${CAPI}/content/123/label`, () => HttpResponse.json({ results: [{ prefix: "global", name: "a", id: "1" }] })));
    const out = await (await h()).json("confluence_get_labels", { pageId: "123" });
    expect(out).toEqual([{ name: "a", prefix: "global" }]);
  });

  it("confluence_add_labels POSTs global labels", async () => {
    let body: any;
    mswServer.use(
      http.post(`${CAPI}/content/123/label`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ results: body });
      }),
    );
    const out = await (await h()).json("confluence_add_labels", { pageId: "123", labels: ["a", "b"] });
    expect(body).toEqual([{ prefix: "global", name: "a" }, { prefix: "global", name: "b" }]);
    expect(out).toEqual([{ name: "a", prefix: "global" }, { name: "b", prefix: "global" }]);
  });

  it("confluence_add_labels rejects an empty list", async () => {
    expect((await (await h()).call("confluence_add_labels", { pageId: "123", labels: [] })).isError).toBe(true);
  });

  it("read-only mode lists only the read tools", async () => {
    expect(await (await h({ readOnly: true })).toolNames()).toEqual(["confluence_get_comments", "confluence_get_labels"]);
  });
});
