import type { ToolContext } from "../define.js";
import * as attachments from "./attachments.js";
import * as comments from "./comments.js";
import * as labels from "./labels.js";
import * as pages from "./pages.js";

export function registerConfluence(ctx: ToolContext): void {
  for (const group of [pages, comments, labels, attachments]) group.register(ctx);
}
