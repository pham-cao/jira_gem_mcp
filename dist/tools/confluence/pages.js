import { z } from "zod";
import { isLossyForMarkdown, storageToMarkdown } from "../../confluence/convert.js";
import { confluencePaged, slimPage, toStorage } from "../../confluence/format.js";
import { defineTool, numericId, requireConfluence } from "../define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */
const limit = z.number().int().min(1).max(100).default(25);
const start = z.number().int().min(0).default(0);
const LOSSY_NOTE = 'Markdown is lossy for macros, images, page links, mentions and table formatting — edit such pages with format "storage"; ' +
    "never write back a body read with truncated: true.";
const format = z.enum(["markdown", "storage"]).default("markdown").describe('"markdown" (default) or "storage" (Confluence XHTML)');
export function register(ctx) {
    const conf = () => requireConfluence(ctx);
    defineTool(ctx, "confluence_search", {
        description: "Search Confluence content with CQL (e.g. `type=page AND space=DEV AND text~\"deploy\"`), with paging.",
        input: { cql: z.string().trim().min(1), limit, start },
    }, async (args) => {
        const c = conf();
        const res = await c.get("/rest/api/content/search", { cql: args.cql, limit: args.limit, start: args.start, expand: "space,version" });
        return confluencePaged(res.results.map((p) => slimPage(p, c.baseUrl)), res);
    });
    defineTool(ctx, "confluence_get_page", {
        description: "Get a page by pageId, or by spaceKey + title. The body is converted to Markdown by default; format \"storage\" returns raw Confluence XHTML. " +
            "Long bodies are cut at maxChars. " +
            LOSSY_NOTE,
        input: {
            pageId: numericId.optional(),
            spaceKey: z.string().trim().min(1).optional(),
            title: z.string().min(1).optional(),
            format,
            maxChars: z.number().int().min(1).default(50000),
        },
    }, async (args) => {
        const c = conf();
        const expand = "body.storage,version,space,ancestors";
        let p;
        if (args.pageId) {
            p = await c.get(`/rest/api/content/${args.pageId}`, { expand });
        }
        else if (args.spaceKey && args.title) {
            const res = await c.get("/rest/api/content", { type: "page", spaceKey: args.spaceKey, title: args.title, expand });
            p = res.results[0];
            if (!p)
                throw new Error(`Không tìm thấy trang "${args.title}" trong space ${args.spaceKey}`);
        }
        else {
            throw new Error("Cần pageId, hoặc cả spaceKey và title");
        }
        const storage = p.body?.storage?.value ?? "";
        const full = args.format === "storage" ? storage : storageToMarkdown(storage);
        const truncated = full.length > args.maxChars;
        return {
            ...slimPage(p, c.baseUrl),
            ancestors: (p.ancestors ?? []).map((a) => ({ id: a.id, title: a.title })),
            body: truncated ? full.slice(0, args.maxChars) : full,
            truncated,
            ...(truncated && { totalChars: full.length, warning: "Nội dung đã bị cắt (truncated). Không dùng nội dung này để ghi lại trang." }),
        };
    });
    defineTool(ctx, "confluence_get_page_children", { description: "List the direct child pages of a page, with paging.", input: { pageId: numericId, limit, start } }, async (args) => {
        const c = conf();
        const res = await c.get(`/rest/api/content/${args.pageId}/child/page`, { limit: args.limit, start: args.start, expand: "space,version" });
        return confluencePaged(res.results.map((p) => slimPage(p, c.baseUrl)), res);
    });
    defineTool(ctx, "confluence_list_spaces", { description: "List Confluence spaces, optionally only global or personal ones.", input: { type: z.enum(["global", "personal"]).optional(), limit, start } }, async (args) => {
        const c = conf();
        const res = await c.get("/rest/api/space", { type: args.type, limit: args.limit, start: args.start });
        return confluencePaged(res.results.map((s) => ({ key: s.key, name: s.name, type: s.type, url: c.baseUrl + (s._links?.webui ?? "") })), res);
    });
    defineTool(ctx, "confluence_create_page", {
        description: 'Create a page. body is Markdown by default; format "storage" takes Confluence XHTML.',
        input: { spaceKey: z.string().trim().min(1), title: z.string().min(1), body: z.string(), parentId: numericId.optional(), format },
        write: true,
    }, async (args) => {
        const c = conf();
        const res = await c.post("/rest/api/content", {
            type: "page",
            title: args.title,
            space: { key: args.spaceKey },
            ...(args.parentId && { ancestors: [{ id: args.parentId }] }),
            body: { storage: { value: toStorage(args.body, args.format), representation: "storage" } },
        });
        return { id: res.id, title: res.title, version: res.version?.number, url: c.baseUrl + (res._links?.webui ?? "") };
    });
    defineTool(ctx, "confluence_update_page", {
        description: "Update a page's body and/or title (at least one required). body is Markdown by default; format \"storage\" takes Confluence XHTML. " +
            "Pass version (from confluence_get_page) to fail instead of overwriting a newer edit. " +
            LOSSY_NOTE,
        input: {
            pageId: numericId,
            body: z.string().optional(),
            title: z.string().min(1).optional(),
            version: z.number().int().min(1).optional(),
            format,
            minorEdit: z.boolean().default(false),
            allowLossyMarkdown: z.boolean().default(false).describe("Overwrite with Markdown even if the current page has content Markdown cannot keep"),
        },
        write: true,
    }, async (args) => {
        if (args.body === undefined && args.title === undefined)
            throw new Error("Cần ít nhất body hoặc title");
        const c = conf();
        const cur = await c.get(`/rest/api/content/${args.pageId}`, { expand: "body.storage,version" });
        const current = cur.version.number;
        if (args.version !== undefined && args.version !== current) {
            throw new Error(`Xung đột phiên bản: trang ${args.pageId} đang ở version ${current}, không phải ${args.version}. Hãy đọc lại trang (confluence_get_page) rồi sửa lại.`);
        }
        const curStorage = cur.body?.storage?.value ?? "";
        if (args.body !== undefined && args.format === "markdown" && !args.allowLossyMarkdown && isLossyForMarkdown(curStorage)) {
            throw new Error(`Trang ${args.pageId} có nội dung không chuyển được sang Markdown (macro, ảnh, link trang, mention, định dạng bảng…). ` +
                `Ghi đè bằng Markdown sẽ làm mất các phần này. Hãy đọc lại với format: "storage" và sửa bằng format: "storage", ` +
                `hoặc truyền allowLossyMarkdown: true nếu chấp nhận mất.`);
        }
        const value = args.body !== undefined ? toStorage(args.body, args.format) : curStorage;
        const res = await c.put(`/rest/api/content/${args.pageId}`, {
            type: cur.type ?? "page", // blog posts found via CQL keep their type
            title: args.title ?? cur.title,
            version: { number: current + 1, minorEdit: args.minorEdit },
            body: { storage: { value, representation: "storage" } },
        });
        return { id: res.id, title: res.title, version: res.version?.number, url: c.baseUrl + (res._links?.webui ?? "") };
    });
}
