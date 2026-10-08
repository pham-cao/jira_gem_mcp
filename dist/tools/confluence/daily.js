import { z } from "zod";
import { isEmptyCell, locateDailyCell, renderDailyCell, replaceCell } from "../../confluence/daily.js";
import { HttpError } from "../../http/errors.js";
import { defineTool, issueKey, numericId, requireConfluence } from "../define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */
const item = z.object({
    text: z.string().min(1),
    issueKey: z.string().transform(issueKey).pipe(z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/, "issueKey không hợp lệ")).optional(),
});
export function register(ctx) {
    defineTool(ctx, "confluence_fill_daily", {
        description: "Fill your own cell for one date in the team's daily-meeting page (A. Yesterday / B. Today / C. Problems). " +
            "Always call with preview: true (default) first, show the user the \"after\" content, and only call again with preview: false once they confirm. " +
            "Refuses to replace a non-empty cell unless overwrite: true.",
        input: {
            pageId: numericId,
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date phải có dạng YYYY-MM-DD"),
            yesterday: z.array(item).default([]),
            today: z.array(item).default([]),
            problems: z.array(z.string().min(1)).default([]),
            preview: z.boolean().default(true),
            overwrite: z.boolean().default(false),
        },
        write: true,
    }, async (args) => {
        const c = requireConfluence(ctx);
        const me = await c.get("/rest/api/user/current");
        // Without a userKey no row can match; say so instead of a misleading no-row error.
        if (typeof me?.userKey !== "string" || !me.userKey)
            throw new Error("Không lấy được userKey của tài khoản Confluence hiện tại.");
        const after = renderDailyCell({ yesterday: args.yesterday, today: args.today, problems: args.problems }, ctx.client.baseUrl);
        const url = `${c.baseUrl}/pages/viewpage.action?pageId=${args.pageId}`;
        // One pass: read the page, locate the cell, check overwrite, then preview or PUT.
        const attempt = async () => {
            const page = await c.get(`/rest/api/content/${args.pageId}`, { expand: "body.storage,version" });
            const storage = page.body?.storage?.value ?? "";
            const cell = locateDailyCell(storage, args.date, me.userKey);
            const before = cell.inner;
            if (!isEmptyCell(before) && !args.overwrite) {
                throw new Error(`Ô ngày ${args.date} của bạn đã có nội dung. Xem "before" và gọi lại với overwrite: true nếu muốn ghi đè.\n\n${before}`);
            }
            const row = cell.rowLabel ?? me.username;
            const current = page.version.number;
            if (args.preview)
                return { preview: true, date: args.date, row, before, after, version: current, url };
            const res = await c.put(`/rest/api/content/${args.pageId}`, {
                id: page.id,
                type: page.type ?? "page",
                title: page.title,
                version: { number: current + 1 },
                body: { storage: { value: replaceCell(storage, cell, after), representation: "storage" } },
            });
            return { preview: false, date: args.date, row, before, after, version: res.version?.number ?? current + 1, url };
        };
        try {
            return await attempt();
        }
        catch (e) {
            // A teammate edited the page meanwhile: re-read and redo everything (incl. the overwrite check) once.
            if (e instanceof HttpError && e.status === 409)
                return await attempt();
            throw e;
        }
    });
}
