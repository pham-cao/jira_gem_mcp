import * as attachments from "./attachments.js";
import * as comments from "./comments.js";
import * as daily from "./daily.js";
import * as labels from "./labels.js";
import * as pages from "./pages.js";
export function registerConfluence(ctx) {
    for (const group of [pages, daily, comments, labels, attachments])
        group.register(ctx);
}
