import { z } from "zod";
import { defineTool, numericId, requireConfluence } from "../define.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */
const slim = (l) => ({ name: l.name, prefix: l.prefix });
export function register(ctx) {
    const conf = () => requireConfluence(ctx);
    defineTool(ctx, "confluence_get_labels", { description: "List a page's labels.", input: { pageId: numericId } }, async (args) => {
        const res = await conf().get(`/rest/api/content/${args.pageId}/label`);
        return (res.results ?? []).map(slim);
    });
    defineTool(ctx, "confluence_add_labels", {
        description: "Add global labels to a page.",
        input: { pageId: numericId, labels: z.array(z.string().trim().min(1)).min(1) },
        write: true,
    }, async (args) => {
        const res = await conf().post(`/rest/api/content/${args.pageId}/label`, args.labels.map((name) => ({ prefix: "global", name })));
        return (res.results ?? []).map(slim);
    });
}
