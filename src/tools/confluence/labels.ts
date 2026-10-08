import { z } from "zod";
import { defineTool, numericId, requireConfluence, type ToolContext } from "../define.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */

const slim = (l: any) => ({ name: l.name, prefix: l.prefix });

export function register(ctx: ToolContext): void {
  const conf = () => requireConfluence(ctx);

  defineTool(ctx, "confluence_get_labels", { description: "List a page's labels.", input: { pageId: numericId } }, async (args) => {
    const res = await conf().get<any>(`/rest/api/content/${args.pageId}/label`);
    return (res.results ?? []).map(slim);
  });

  defineTool(
    ctx,
    "confluence_add_labels",
    {
      description: "Add global labels to a page.",
      input: { pageId: numericId, labels: z.array(z.string().trim().min(1)).min(1) },
      write: true,
    },
    async (args) => {
      const res = await conf().post<any>(
        `/rest/api/content/${args.pageId}/label`,
        args.labels.map((name) => ({ prefix: "global", name })),
      );
      return (res.results ?? []).map(slim);
    },
  );
}
