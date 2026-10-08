import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { register } from "../src/tools/confluence/pages.js";
import { CAPI, CONF_BASE, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

const h = (opts: { readOnly?: boolean } = {}) => connectTools([register], { ...opts, confluence: true });

const page = (extra: Record<string, unknown> = {}) => ({
  id: "123",
  type: "page",
  title: "Page",
  space: { key: "X" },
  version: { number: 4, when: "2026-01-01T00:00:00.000Z" },
  body: { storage: { value: "<p>Hello <strong>world</strong></p>" } },
  ancestors: [{ id: "1", title: "Root", type: "page" }],
  _links: { webui: "/display/X/Page" },
  ...extra,
});

describe("confluence page tools", () => {
  it("confluence_search sends cql and returns slim items", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${CAPI}/content/search`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ results: [page()], start: 0, limit: 25, size: 1, _links: { next: "/rest/api/content/search?start=25" } });
      }),
    );
    const out = await (await h()).json("confluence_search", { cql: "type=page" });
    expect(Object.fromEntries(params!)).toEqual({ cql: "type=page", limit: "25", start: "0", expand: "space,version" });
    expect(out.hasMore).toBe(true);
    expect(out.items[0]).toEqual({
      id: "123",
      type: "page",
      title: "Page",
      space: "X",
      version: 4,
      lastModified: "2026-01-01T00:00:00.000Z",
      url: `${CONF_BASE}/display/X/Page`,
    });
  });

  it("confluence_search includes total only when totalSize is a number", async () => {
    let total: number | undefined = 42;
    mswServer.use(
      http.get(`${CAPI}/content/search`, () => HttpResponse.json({ results: [], start: 0, limit: 25, size: 0, ...(total !== undefined && { totalSize: total }) })),
    );
    const harness = await h();
    expect((await harness.json("confluence_search", { cql: "type=page" })).total).toBe(42);
    total = undefined;
    expect("total" in (await harness.json("confluence_search", { cql: "type=page" }))).toBe(false);
  });

  it("confluence_get_page by id returns Markdown, version and ancestors", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${CAPI}/content/123`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(page({ version: { number: 7 } }));
      }),
    );
    const out = await (await h()).json("confluence_get_page", { pageId: "123" });
    expect(params!.get("expand")).toBe("body.storage,version,space,ancestors");
    expect(out.body).toBe("Hello **world**");
    expect(out.version).toBe(7);
    expect(out.ancestors).toEqual([{ id: "1", title: "Root" }]);
    expect(out.truncated).toBe(false);
  });

  it("confluence_get_page returns raw storage with format storage", async () => {
    mswServer.use(http.get(`${CAPI}/content/123`, () => HttpResponse.json(page())));
    const out = await (await h()).json("confluence_get_page", { pageId: "123", format: "storage" });
    expect(out.body).toBe("<p>Hello <strong>world</strong></p>");
  });

  it("confluence_get_page truncates to maxChars", async () => {
    mswServer.use(http.get(`${CAPI}/content/123`, () => HttpResponse.json(page())));
    const out = await (await h()).json("confluence_get_page", { pageId: "123", maxChars: 10 });
    expect(out.body.length).toBe(10);
    expect(out.truncated).toBe(true);
    expect(out.totalChars).toBe("Hello **world**".length);
  });

  it("confluence_get_page looks up by spaceKey + title", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${CAPI}/content`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json({ results: [page()] });
      }),
    );
    const out = await (await h()).json("confluence_get_page", { spaceKey: "X", title: "Page" });
    expect(params!.get("type")).toBe("page");
    expect(params!.get("spaceKey")).toBe("X");
    expect(params!.get("title")).toBe("Page");
    expect(out.id).toBe("123");
  });

  it("confluence_get_page reports a missing page by title", async () => {
    mswServer.use(http.get(`${CAPI}/content`, () => HttpResponse.json({ results: [] })));
    const r = await (await h()).call("confluence_get_page", { spaceKey: "X", title: "T" });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain('Không tìm thấy trang "T" trong space X');
  });

  it("confluence_get_page requires pageId or spaceKey+title", async () => {
    const r = await (await h()).call("confluence_get_page", {});
    expect(r.isError).toBe(true);
  });

  it("confluence_get_page rejects a non-numeric pageId without a request", async () => {
    const r = await (await h()).call("confluence_get_page", { pageId: "12/../1" });
    expect(r.isError).toBe(true);
  });

  it("confluence_get_page_children and confluence_list_spaces page results", async () => {
    let p1: URLSearchParams | undefined;
    let p2: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${CAPI}/content/123/child/page`, ({ request }) => {
        p1 = new URL(request.url).searchParams;
        return HttpResponse.json({ results: [page({ id: "5" })], start: 0, limit: 25, size: 1 });
      }),
      http.get(`${CAPI}/space`, ({ request }) => {
        p2 = new URL(request.url).searchParams;
        return HttpResponse.json({
          results: [{ key: "X", name: "Space X", type: "global", _links: { webui: "/display/X" } }],
          start: 0,
          limit: 25,
          size: 1,
        });
      }),
    );
    const harness = await h();
    const kids = await harness.json("confluence_get_page_children", { pageId: "123" });
    expect(kids.items[0].id).toBe("5");
    expect(p1!.get("expand")).toBe("space,version");
    const spaces = await harness.json("confluence_list_spaces", { type: "global" });
    expect(p2!.get("type")).toBe("global");
    expect(spaces.items[0]).toEqual({ key: "X", name: "Space X", type: "global", url: `${CONF_BASE}/display/X` });
  });

  it("confluence_create_page posts converted Markdown", async () => {
    let body: unknown;
    mswServer.use(
      http.post(`${CAPI}/content`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(page({ id: "50", title: "T", version: { number: 1 } }));
      }),
    );
    const out = await (await h()).json("confluence_create_page", { spaceKey: "X", title: "T", body: "Hi", parentId: "9" });
    expect(body).toEqual({
      type: "page",
      title: "T",
      space: { key: "X" },
      ancestors: [{ id: "9" }],
      body: { storage: { value: "<p>Hi</p>", representation: "storage" } },
    });
    expect(out).toEqual({ id: "50", title: "T", version: 1, url: `${CONF_BASE}/display/X/Page` });
  });

  it("confluence_update_page bumps the version and keeps the title", async () => {
    let params: URLSearchParams | undefined;
    let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    mswServer.use(
      http.get(`${CAPI}/content/123`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json(page());
      }),
      http.put(`${CAPI}/content/123`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(page({ version: { number: 5 } }));
      }),
    );
    const out = await (await h()).json("confluence_update_page", { pageId: "123", body: "New" });
    expect(params!.get("expand")).toBe("body.storage,version");
    expect(body.version).toEqual({ number: 5, minorEdit: false });
    expect(body.title).toBe("Page");
    expect(body.body.storage).toEqual({ value: "<p>New</p>", representation: "storage" });
    expect(out.version).toBe(5);
  });

  it("confluence_update_page with only title resends the current body", async () => {
    let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    mswServer.use(
      http.get(`${CAPI}/content/123`, () => HttpResponse.json(page())),
      http.put(`${CAPI}/content/123`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(page({ title: "New title", version: { number: 5 } }));
      }),
    );
    await (await h()).json("confluence_update_page", { pageId: "123", title: "New title" });
    expect(body.title).toBe("New title");
    expect(body.body.storage).toEqual({ value: "<p>Hello <strong>world</strong></p>", representation: "storage" });
  });

  it("confluence_update_page rejects a stale version without a PUT", async () => {
    mswServer.use(http.get(`${CAPI}/content/123`, () => HttpResponse.json(page())));
    const r = await (await h()).call("confluence_update_page", { pageId: "123", body: "x", version: 3 });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain(
      "Xung đột phiên bản: trang 123 đang ở version 4, không phải 3. Hãy đọc lại trang (confluence_get_page) rồi sửa lại.",
    );
  });

  describe("lossy Markdown write-back guard", () => {
    const LOSSY =
      'Trang 123 có nội dung không chuyển được sang Markdown (macro, ảnh, link trang, mention, định dạng bảng…). Ghi đè bằng Markdown sẽ làm mất các phần này. Hãy đọc lại với format: "storage" và sửa bằng format: "storage", hoặc truyền allowLossyMarkdown: true nếu chấp nhận mất.';
    const withStorage = (value: string, onPut: (b: any) => void) => // eslint-disable-line @typescript-eslint/no-explicit-any
      mswServer.use(
        http.get(`${CAPI}/content/123`, () => HttpResponse.json(page({ body: { storage: { value } } }))),
        http.put(`${CAPI}/content/123`, async ({ request }) => {
          onPut(await request.json());
          return HttpResponse.json(page({ version: { number: 5 } }));
        }),
      );
    const IMAGE = '<p>x</p><ac:image><ri:attachment ri:filename="a.png" /></ac:image>';

    it("refuses Markdown over a page with an image, without a PUT", async () => {
      let puts = 0;
      withStorage(IMAGE, () => puts++);
      const r = await (await h()).call("confluence_update_page", { pageId: "123", body: "New" });
      expect(r.isError).toBe(true);
      expect((r.content[0] as { text: string }).text).toContain(LOSSY);
      expect(puts).toBe(0);
    });

    it.each([
      ["a user mention", '<p><ac:link><ri:user ri:userkey="abc" /></ac:link></p>'],
      ["an info macro", '<ac:structured-macro ac:name="info"><ac:rich-text-body><p>x</p></ac:rich-text-body></ac:structured-macro>'],
      ["a plain img", '<p><img src="x.png" /></p>'],
      ["a colspan", '<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>'],
      ["a rowspan", '<table><tbody><tr><td rowspan="2">x</td></tr></tbody></table>'],
      ["inline style", '<p style="color: red;">x</p>'],
    ])("refuses Markdown over %s", async (_name, value) => {
      let puts = 0;
      withStorage(value, () => puts++);
      const r = await (await h()).call("confluence_update_page", { pageId: "123", body: "New" });
      expect((r.content[0] as { text: string }).text).toContain(LOSSY);
      expect(puts).toBe(0);
    });

    it("sends the PUT with allowLossyMarkdown: true", async () => {
      let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      withStorage(IMAGE, (b) => (body = b));
      await (await h()).json("confluence_update_page", { pageId: "123", body: "New", allowLossyMarkdown: true });
      expect(body.body.storage.value).toBe("<p>New</p>");
    });

    it("allows a page with only code/noformat macros and plain HTML", async () => {
      let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      withStorage(
        '<h1>T</h1><p>a <strong>b</strong></p><ac:structured-macro ac:name="code" ac:schema-version="1"><ac:parameter ac:name="language">js</ac:parameter>' +
          '<ac:plain-text-body><![CDATA[x = "<ac:image>" + style="a"]]></ac:plain-text-body></ac:structured-macro>' +
          '<ac:structured-macro ac:name="noformat"><ac:plain-text-body><![CDATA[raw]]></ac:plain-text-body></ac:structured-macro>',
        (b) => (body = b),
      );
      await (await h()).json("confluence_update_page", { pageId: "123", body: "New" });
      expect(body.body.storage.value).toBe("<p>New</p>");
    });

    it("does not guard format storage", async () => {
      let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      withStorage(IMAGE, (b) => (body = b));
      await (await h()).json("confluence_update_page", { pageId: "123", body: "<p>S</p>", format: "storage" });
      expect(body.body.storage.value).toBe("<p>S</p>");
    });

    it("does not guard title-only updates", async () => {
      let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      withStorage(IMAGE, (b) => (body = b));
      await (await h()).json("confluence_update_page", { pageId: "123", title: "T2" });
      expect(body.body.storage.value).toBe(IMAGE);
    });

    it("describes the lossiness in get_page and update_page", async () => {
      const tools = (await (await h()).client.listTools()).tools;
      for (const name of ["confluence_get_page", "confluence_update_page"]) {
        expect(tools.find((t) => t.name === name)!.description).toContain(
          'Markdown is lossy for macros, images, page links, mentions and table formatting — edit such pages with format "storage"; ' +
            "never write back a body read with truncated: true.",
        );
      }
    });
  });

  it("confluence_update_page keeps the content type of a blog post", async () => {
    let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    mswServer.use(
      http.get(`${CAPI}/content/123`, () => HttpResponse.json(page({ type: "blogpost" }))),
      http.put(`${CAPI}/content/123`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(page({ type: "blogpost", version: { number: 5 } }));
      }),
    );
    await (await h()).json("confluence_update_page", { pageId: "123", body: "New" });
    expect(body.type).toBe("blogpost");
  });

  it("confluence_get_page warns not to write back a truncated body", async () => {
    mswServer.use(http.get(`${CAPI}/content/123`, () => HttpResponse.json(page())));
    const harness = await h();
    const cut = await harness.json("confluence_get_page", { pageId: "123", maxChars: 10 });
    expect(cut.warning).toBe("Nội dung đã bị cắt (truncated). Không dùng nội dung này để ghi lại trang.");
    expect("warning" in (await harness.json("confluence_get_page", { pageId: "123" }))).toBe(false);
  });

  it("confluence_update_page needs body or title", async () => {
    const r = await (await h()).call("confluence_update_page", { pageId: "123" });
    expect(r.isError).toBe(true);
  });

  it("read-only mode lists only the read tools", async () => {
    expect(await (await h({ readOnly: true })).toolNames()).toEqual([
      "confluence_get_page",
      "confluence_get_page_children",
      "confluence_list_spaces",
      "confluence_search",
    ]);
  });
});
