import { describe, expect, it } from "vitest";
import { markdownToStorage, storageToMarkdown } from "../src/confluence/convert.js";

describe("markdownToStorage", () => {
  it("renders code blocks as the code macro", () => {
    expect(markdownToStorage("```ts\nconst a = 1 < 2;\n```")).toBe(
      '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">ts</ac:parameter>' +
        "<ac:plain-text-body><![CDATA[const a = 1 < 2;]]></ac:plain-text-body></ac:structured-macro>",
    );
  });
  it("omits the language parameter when none is given", () => {
    expect(markdownToStorage("```\nx\n```")).not.toContain("ac:parameter");
  });
  it("splits ]]> inside code", () => {
    expect(markdownToStorage("```\na]]>b\n```")).toContain("<![CDATA[a]]]]><![CDATA[>b]]>");
  });
  it("escapes raw HTML and special characters", () => {
    const out = markdownToStorage("Tiếng Việt a < b & c <script>x</script>");
    expect(out).toBe("<p>Tiếng Việt a &lt; b &amp; c &lt;script&gt;x&lt;/script&gt;</p>");
  });
  it("self-closes void elements", () => {
    const out = markdownToStorage("a  \nb\n\n---\n\n![alt](https://x/i.png)");
    expect(out).toContain("<br />");
    expect(out).toContain("<hr />");
    expect(out).toMatch(/<img src="https:\/\/x\/i.png" alt="alt" \/>/);
  });
  it("renders GFM tables and nested lists", () => {
    const out = markdownToStorage("| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n  - y");
    expect(out).toContain("<table>");
    expect(out).toContain("<td>2</td>");
    expect(out).toMatch(/<li>x\s*<ul>\s*<li>y<\/li>/);
  });
  it("renders task list items as text, not inputs", () => {
    expect(markdownToStorage("- [x] done")).not.toContain("<input");
  });
  it("emits only XML-safe character references", () => {
    expect(markdownToStorage("a &nbsp; &copy; b &bogus; &amp;")).toBe("<p>a &#160; &#169; b &amp;bogus; &amp;</p>");
  });
  it("leaves entities inside code bodies alone", () => {
    expect(markdownToStorage("```\n&copy;\n```")).toContain("<![CDATA[&copy;]]>");
  });
  it("wraps block-level raw HTML in a paragraph", () => {
    expect(markdownToStorage("<div>\nhi\n</div>")).toBe("<p>&lt;div&gt;\nhi\n&lt;/div&gt;</p>");
  });
  it("does not resolve inherited object keys as entities", () => {
    expect(markdownToStorage("&toString; &constructor;")).toBe("<p>&amp;toString; &amp;constructor;</p>");
  });
});

describe("storageToMarkdown", () => {
  const code = (lang: string, body: string) =>
    `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${lang}</ac:parameter><ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>`;

  it("keeps CDATA code content", () => {
    expect(storageToMarkdown(code("ts", "if (a < b) {}"))).toBe("```ts\nif (a < b) {}\n```");
  });
  it("does not swallow siblings after self-closing ri:/ac: tags", () => {
    const md = storageToMarkdown('<p><ac:link><ri:page ri:content-title="Spec" /></ac:link> và <strong>sau</strong></p>');
    expect(md).toBe("[Spec] và **sau**");
  });
  it.each([["info", "Info"], ["note", "Note"], ["warning", "Warning"], ["tip", "Tip"]])("renders %s panels", (name, label) => {
    const md = storageToMarkdown(`<ac:structured-macro ac:name="${name}"><ac:rich-text-body><p>Chú ý</p></ac:rich-text-body></ac:structured-macro>`);
    expect(md).toBe(`> **${label}:** Chú ý`);
  });
  it("renders jira macro as the issue key", () => {
    expect(storageToMarkdown('<p><ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">ABC-12</ac:parameter></ac:structured-macro></p>')).toBe("ABC-12");
  });
  it("renders attachment images", () => {
    expect(storageToMarkdown('<ac:image><ri:attachment ri:filename="a.png" /></ac:image>')).toBe("![a.png]");
  });
  it("marks unknown macros", () => {
    expect(storageToMarkdown('<ac:structured-macro ac:name="toc" />')).toBe("[macro: toc]");
  });
  it("keeps tables", () => {
    expect(storageToMarkdown("<table><tbody><tr><th>a</th></tr><tr><td>1</td></tr></tbody></table>")).toContain("| a |");
  });
  it.each(["# Tiêu đề\n\nĐoạn **đậm**", "- a\n- b", "| a | b |\n| --- | --- |\n| 1 | 2 |", "```js\nx()\n```"])(
    "round-trips %j", (md) => { expect(storageToMarkdown(markdownToStorage(md))).toBe(md); });
});
