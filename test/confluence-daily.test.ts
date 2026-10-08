import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { locateDailyCell, renderDailyCell, replaceCell } from "../src/confluence/daily.js";
import { register } from "../src/tools/confluence/daily.js";
import { BASE_URL, CAPI, CONF_BASE, connectTools, mswServer, useMsw } from "./helpers.js";
import { DAILY_PAGE, ME } from "./fixtures/daily-page.js";

useMsw();

const page = (version: number, value = DAILY_PAGE) => ({ id: "5", type: "page", title: "Daily", version: { number: version }, body: { storage: { value } } });
const URL5 = `${CAPI}/content/5`;
const content = { today: [{ text: "Làm API", issueKey: "abc-1 " }], yesterday: [{ text: "Viết test" }], problems: ["Chờ review"] };
const AFTER = renderDailyCell({ yesterday: [{ text: "Viết test" }], today: [{ text: "Làm API", issueKey: "ABC-1" }], problems: ["Chờ review"] }, BASE_URL);

function setup(gets: unknown[], puts: Array<number | object> = []) {
  const bodies: any[] = [];
  let g = 0;
  let p = 0;
  mswServer.use(
    http.get(`${CAPI}/user/current`, () => HttpResponse.json({ type: "known", username: "caopv", userKey: ME })),
    http.get(URL5, () => HttpResponse.json(gets[Math.min(g++, gets.length - 1)] as object)),
    ...(puts.length
      ? [
          http.put(URL5, async ({ request }) => {
            bodies.push(await request.json());
            const r = puts[p++];
            return typeof r === "number" ? new HttpResponse(null, { status: r }) : HttpResponse.json(r);
          }),
        ]
      : []),
  );
  return bodies;
}

describe("confluence_fill_daily", () => {
  it("previews without writing", async () => {
    setup([page(2)]);
    const h = await connectTools([register], { confluence: true });
    const r = await h.json("confluence_fill_daily", { pageId: "5", date: "2026-10-08", ...content });
    expect(r).toEqual({ preview: true, date: "2026-10-08", row: "Cao PV", before: "<br />", after: AFTER, version: 2, url: `${CONF_BASE}/pages/viewpage.action?pageId=5` });
  });

  it("writes with version + 1 when preview is false", async () => {
    const bodies = setup([page(2)], [page(3)]);
    const h = await connectTools([register], { confluence: true });
    const r = await h.json("confluence_fill_daily", { pageId: "5", date: "2026-10-08", preview: false, ...content });
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-08", ME);
    expect(bodies).toEqual([{ id: "5", type: "page", title: "Daily", version: { number: 3 }, body: { storage: { value: replaceCell(DAILY_PAGE, cell, AFTER), representation: "storage" } } }]);
    expect(r.version).toBe(3);
    expect(r.preview).toBe(false);
  });

  it("refuses a filled cell unless overwrite is true", async () => {
    const bodies = setup([page(2)], [page(3)]);
    const h = await connectTools([register], { confluence: true });
    const r = await h.call("confluence_fill_daily", { pageId: "5", date: "2026-10-07", preview: false, ...content });
    const text = (r.content[0] as { text: string }).text;
    expect(r.isError).toBe(true);
    expect(text).toContain('Ô ngày 2026-10-07 của bạn đã có nội dung. Xem "before" và gọi lại với overwrite: true nếu muốn ghi đè.');
    expect(text).toContain("Thiết kế API");
    expect(bodies).toHaveLength(0);
    const ok = await h.json("confluence_fill_daily", { pageId: "5", date: "2026-10-07", preview: false, overwrite: true, ...content });
    expect(ok.version).toBe(3);
    expect(bodies).toHaveLength(1);
  });

  it("retries once on 409 with the re-fetched version", async () => {
    const bodies = setup([page(2), page(3)], [409, page(4)]);
    const h = await connectTools([register], { confluence: true });
    const r = await h.json("confluence_fill_daily", { pageId: "5", date: "2026-10-08", preview: false, ...content });
    expect(bodies.map((b) => b.version.number)).toEqual([3, 4]);
    expect(r.version).toBe(4);
  });

  it("re-checks overwrite after a 409 when a teammate filled the cell", async () => {
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-08", ME);
    const filled = replaceCell(DAILY_PAGE, cell, "<p>của người khác</p>");
    const bodies = setup([page(2), page(3, filled)], [409, page(4)]);
    const h = await connectTools([register], { confluence: true });
    const r = await h.call("confluence_fill_daily", { pageId: "5", date: "2026-10-08", preview: false, ...content });
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toContain("đã có nội dung");
    expect(bodies).toHaveLength(1);
  });

  it("rejects an invalid issueKey without any request", async () => {
    const h = await connectTools([register], { confluence: true });
    const r = await h.call("confluence_fill_daily", { pageId: "5", date: "2026-10-08", today: [{ text: "x", issueKey: "bad key" }] });
    expect(r.isError).toBe(true);
  });

  it("is hidden in read-only mode", async () => {
    const h = await connectTools([register], { confluence: true, readOnly: true });
    expect(await h.toolNames()).not.toContain("confluence_fill_daily");
  });
});
