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
    html({ text }) {
      return esc(text);
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

export function markdownToStorage(src: string): string {
  return (md.parse(src, { async: false }) as string).trimEnd();
}
