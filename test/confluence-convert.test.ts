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
  it("does not end a code body at a closing tag inside CDATA", () => {
    expect(storageToMarkdown(code("xml", "x <ac:plain-text-body>y</ac:plain-text-body> z"))).toBe(
      "```xml\nx <ac:plain-text-body>y</ac:plain-text-body> z\n```",
    );
  });
  it("renders task lists as GFM checkboxes", () => {
    const xml =
      "<ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>incomplete</ac:task-status><ac:task-body>Do A</ac:task-body></ac:task>" +
      "<ac:task><ac:task-id>2</ac:task-id><ac:task-status>complete</ac:task-status><ac:task-body>Do <strong>B</strong></ac:task-body></ac:task></ac:task-list>";
    expect(storageToMarkdown(xml)).toBe("- [ ] Do A\n- [x] Do **B**");
  });
  it("keeps multi-line indented code with blank lines", () => {
    expect(storageToMarkdown(code("py", "def f():\n\n    if a:\n        return 1\n"))).toBe("```py\ndef f():\n\n    if a:\n        return 1\n```");
  });
  it("joins split CDATA back into ]]>", () => {
    const xml = '<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[a]]]]><![CDATA[>b]]></ac:plain-text-body></ac:structured-macro>';
    expect(storageToMarkdown(xml)).toBe("```\na]]>b\n```");
  });
  it("renders nested and ordered lists with start", () => {
    expect(storageToMarkdown('<ol start="3"><li>a<ul><li>b</li></ul></li><li>d</li></ol>')).toBe("3. a\n   - b\n4. d");
  });
  it("keeps single spaces around inline empty macros", () => {
    expect(storageToMarkdown('<p>S: <ac:structured-macro ac:name="status" /> end</p>')).toBe("S: [macro: status] end");
  });
  it("renders nested macros", () => {
    const xml =
      '<ac:structured-macro ac:name="expand"><ac:parameter ac:name="title">T</ac:parameter><ac:rich-text-body>' +
      `<ac:structured-macro ac:name="info"><ac:rich-text-body><p>Read</p>${code("sh", "ls\npwd")}</ac:rich-text-body></ac:structured-macro>` +
      "</ac:rich-text-body></ac:structured-macro>";
    expect(storageToMarkdown(xml)).toBe("[macro: expand]\n\n> **Info:** Read\n> \n> ```sh\n> ls\n> pwd\n> ```");
  });
  it("keeps siblings after a self-closing tag inside an inline run", () => {
    expect(storageToMarkdown('<p>a <em>b <ac:image><ri:attachment ri:filename="i.png" /></ac:image> c</em> d</p>')).toBe("a _b ![i.png] c_ d");
  });
});
