import { describe, expect, it } from "vitest";
import { markdownToStorage } from "../src/confluence/convert.js";

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
});
