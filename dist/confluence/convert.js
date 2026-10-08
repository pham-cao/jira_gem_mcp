import { Marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Dedicated instance so global marked options are never touched. Output must be well-formed XHTML.
const md = new Marked({
    gfm: true,
    renderer: {
        code({ text, lang }) {
            const language = (lang ?? "").trim().split(/\s+/)[0];
            const param = language ? `<ac:parameter ac:name="language">${esc(language)}</ac:parameter>` : "";
            const body = text.replace(/]]>/g, "]]]]><![CDATA[>");
            return `<ac:structured-macro ac:name="code">${param}<ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>`;
        },
        // Raw HTML is shown as text, never passed through.
        html({ text, block }) {
            return block ? `<p>${esc(text)}</p>\n` : esc(text);
        },
        br() {
            return "<br />";
        },
        hr() {
            return "<hr />\n";
        },
        image({ href, title, text }) {
            return `<img src="${esc(href)}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ""} />`;
        },
        checkbox({ checked }) {
            return checked ? "[x] " : "[ ] ";
        },
    },
});
// Common HTML named entities -> code points; XML only defines amp/lt/gt/quot/apos.
const NAMED = {
    nbsp: 160, copy: 169, reg: 174, trade: 8482, hellip: 8230, mdash: 8212, ndash: 8211, lsquo: 8216, rsquo: 8217, ldquo: 8220,
    rdquo: 8221, laquo: 171, raquo: 187, bull: 8226, middot: 183, times: 215, divide: 247, euro: 8364, pound: 163, yen: 165, cent: 162,
    deg: 176, plusmn: 177, larr: 8592, rarr: 8594, uarr: 8593, darr: 8595, sect: 167, para: 182, ne: 8800, le: 8804, ge: 8805,
};
const XML_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);
// Make named references XML-safe: known -> numeric, unknown -> literal text. CDATA bodies are left untouched.
function fixEntities(html) {
    return html
        .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
        .map((part, i) => i % 2
        ? part
        : part.replace(/&([A-Za-z][A-Za-z0-9]*);/g, (m, name) => XML_ENTITIES.has(name) ? m : Object.hasOwn(NAMED, name) ? `&#${NAMED[name]};` : `&amp;${name};`))
        .join("");
}
export function markdownToStorage(src) {
    return fixEntities(md.parse(src, { async: false })).trimEnd();
}
const PANELS = { info: "Info", note: "Note", warning: "Warning", tip: "Tip" };
const CDATA = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
const PLAIN_BODY_OR_CDATA = /<ac:plain-text-body>((?:<!\[CDATA\[[\s\S]*?\]\]>|[^<])*)<\/ac:plain-text-body>|<!\[CDATA\[([\s\S]*?)\]\]>/g;
const child = (node, name) => Array.from(node.childNodes).find((n) => n.nodeName === name);
const param = (node, name) => Array.from(node.childNodes).find((n) => n.nodeName === "AC:PARAMETER" && n.getAttribute("ac:name") === name)?.textContent ?? undefined;
const quote = (label, body) => `\n\n${`**${label}:** ${body.trim()}`.replace(/^/gm, "> ")}\n\n`;
function macro(el, content, bodies) {
    const name = el.getAttribute("ac:name") ?? "";
    if (name === "code" || name === "noformat") {
        const idx = child(el, "AC:PLAIN-TEXT-BODY")?.getAttribute("data-body");
        const body = (idx == null ? "" : bodies[Number(idx)]).replace(/\n$/, "");
        const fence = "`".repeat(Math.max(3, ...(body.match(/`{3,}/g) ?? []).map((f) => f.length + 1)));
        return `\n\n${fence}${param(el, "language")?.trim() ?? ""}\n${body}\n${fence}\n\n`;
    }
    if (Object.hasOwn(PANELS, name))
        return quote(PANELS[name], content);
    if (name === "jira")
        return param(el, "key")?.trim() ?? "";
    return `[macro: ${name}]${content.trim() ? `\n\n${content.trim()}\n\n` : ""}`;
}
// Replacement for Confluence ac:/ri: elements; undefined means "not ours".
function confluence(content, el, bodies) {
    switch (el.nodeName) {
        case "AC:STRUCTURED-MACRO":
        case "AC:MACRO":
            return macro(el, content, bodies);
        case "AC:PARAMETER":
        case "AC:PLAIN-TEXT-BODY":
        case "AC:TASK-ID":
        case "AC:TASK-STATUS":
            return "";
        case "AC:TASK-LIST":
            return `\n\n${content.trim()}\n\n`;
        case "AC:TASK": {
            const done = child(el, "AC:TASK-STATUS")?.textContent?.trim() === "complete";
            return `- [${done ? "x" : " "}] ${content.trim().replace(/\n(?=[^\n])/g, "\n  ")}\n`;
        }
        case "AC:LINK": {
            const title = child(el, "RI:PAGE")?.getAttribute("ri:content-title") ?? child(el, "RI:ATTACHMENT")?.getAttribute("ri:filename");
            return title ? `[${title}]` : content;
        }
        case "AC:IMAGE":
            return `![${child(el, "RI:ATTACHMENT")?.getAttribute("ri:filename") ?? child(el, "RI:URL")?.getAttribute("ri:value") ?? ""}]`;
    }
    return undefined;
}
// Turndown collapses whitespace in every non-<pre> text node, so plain-text bodies are stashed and read back by index.
function makeTurndown(bodies) {
    const td = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
        // Empty elements (e.g. <ac:link><ri:page/></ac:link>) bypass custom rules and land here.
        blankReplacement: (content, node) => confluence(content, node, bodies) ?? (node.isBlock ? "\n\n" : ""),
    });
    td.use(gfm);
    td.addRule("confluence", {
        filter: (n) => confluence("", n, bodies) !== undefined,
        replacement: (content, node) => confluence(content, node, bodies) ?? content,
    });
    // Single space after the marker (Turndown 7.2 pads to 4 columns).
    td.addRule("listItem", {
        filter: "li",
        replacement: (content, node, options) => {
            const parent = node.parentNode;
            let prefix = `${options.bulletListMarker} `;
            if (parent.nodeName === "OL") {
                const start = parent.getAttribute("start");
                prefix = `${(start ? Number(start) : 1) + Array.prototype.indexOf.call(parent.children, node)}. `;
            }
            const body = content.replace(/^\n+/, "").replace(/\n+$/, "\n").replace(/\n/gm, `\n${" ".repeat(prefix.length)}`);
            return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
        },
    });
    return td;
}
export function storageToMarkdown(xhtml) {
    const bodies = [];
    const html = xhtml
        // One left-to-right pass so markup inside CDATA is never mistaken for tags. Plain-text bodies are stashed (joining split
        // CDATA sections restores any "]]>"); other CDATA becomes escaped text.
        .replace(PLAIN_BODY_OR_CDATA, (_m, inner, text) => {
        if (inner === undefined)
            return esc(text ?? "");
        bodies.push(inner.replace(CDATA, "$1"));
        return `<ac:plain-text-body data-body="${bodies.length - 1}"></ac:plain-text-body>`;
    })
        // The HTML parser treats self-closing unknown tags as open tags, swallowing later siblings.
        .replace(/<((?:ac|ri):[\w-]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/>/g, "<$1$2></$1>")
        // A void child keeps Turndown from trimming the spaces around empty inline elements.
        .replace(/<((?:ac|ri):[\w-]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*>\s*<\/\1>/g, "<$1$2><wbr /></$1>");
    return makeTurndown(bodies).turndown(html).trim();
}
// Storage constructs storageToMarkdown cannot round-trip: any ac:/ri: element other than code/noformat macros (with their
// parameters and plain-text bodies), images, merged table cells and inline styles. CDATA is skipped so code is never inspected.
export function isLossyForMarkdown(xhtml) {
    const html = xhtml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
    if (/<img[\s/>]|<[a-z][^>]*\s(?:colspan|rowspan|style)\s*=/i.test(html))
        return true;
    for (const [, name, attrs] of html.matchAll(/<((?:ac|ri):[\w-]+)([^>]*)>/gi)) {
        const n = name.toLowerCase();
        if (n === "ac:parameter" || n === "ac:plain-text-body")
            continue;
        if (n === "ac:structured-macro" && /\bac:name\s*=\s*["'](?:code|noformat)["']/i.test(attrs))
            continue;
        return true;
    }
    return false;
}
