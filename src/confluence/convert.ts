import { Marked } from "marked";

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
const NAMED: Record<string, number> = {
  nbsp: 160, copy: 169, reg: 174, trade: 8482, hellip: 8230, mdash: 8212, ndash: 8211, lsquo: 8216, rsquo: 8217, ldquo: 8220,
  rdquo: 8221, laquo: 171, raquo: 187, bull: 8226, middot: 183, times: 215, divide: 247, euro: 8364, pound: 163, yen: 165, cent: 162,
  deg: 176, plusmn: 177, larr: 8592, rarr: 8594, uarr: 8593, darr: 8595, sect: 167, para: 182, ne: 8800, le: 8804, ge: 8805,
};
const XML_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);

// Make named references XML-safe: known -> numeric, unknown -> literal text. CDATA bodies are left untouched.
function fixEntities(html: string): string {
  return html
    .split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(/&([A-Za-z][A-Za-z0-9]*);/g, (m, name: string) =>
            XML_ENTITIES.has(name) ? m : Object.hasOwn(NAMED, name) ? `&#${NAMED[name]};` : `&amp;${name};`,
          ),
    )
    .join("");
}

export function markdownToStorage(src: string): string {
  return fixEntities(md.parse(src, { async: false }) as string).trimEnd();
}
