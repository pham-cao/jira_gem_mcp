import { describe, expect, it } from "vitest";
import { HttpClient } from "../src/http/client.js";
import { HttpError, formatError } from "../src/http/errors.js";

const mk = (status: number, extra: Partial<ConstructorParameters<typeof HttpError>[0]> = {}) =>
  new HttpError({ status, method: "GET", path: "/rest/api/content/1", messages: [], fieldErrors: {}, captcha: false, ...extra });

describe("HttpError (Confluence)", () => {
  it("parses Confluence error bodies", async () => {
    const res = new Response(JSON.stringify({ statusCode: 400, message: "Bad body", data: { errors: [{ message: { translation: "Title missing" } }] } }), { status: 400 });
    const e = await HttpError.fromResponse(res, "POST", "/rest/api/content", "Confluence");
    expect(e.service).toBe("Confluence");
    expect(e.messages).toEqual(["Bad body", "Title missing"]);
    expect(e.message).toBe("Confluence 400 POST /rest/api/content");
  });
  it("detects Confluence CAPTCHA via X-Seraph-LoginReason", async () => {
    const res = new Response(null, { status: 401, headers: { "X-Seraph-LoginReason": "AUTHENTICATION_DENIED" } });
    const e = await HttpError.fromResponse(res, "GET", "/x", "Confluence");
    expect(e.captcha).toBe(true);
    expect(formatError(e)).toBe("Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập Confluence trên trình duyệt một lần để mở khoá.");
  });
  it("formats Confluence 400 with a storage hint", () => {
    expect(formatError(mk(400, { service: "Confluence", messages: ["bad xhtml"] }))).toBe(
      'Yêu cầu không hợp lệ (400):\nbad xhtml\nGợi ý: nội dung storage XHTML có thể không hợp lệ; thử format: "markdown".');
  });
  it("formats 409 as a version conflict", () => {
    expect(formatError(mk(409, { service: "Confluence" }))).toBe(
      "Xung đột khi ghi (409): trang vừa bị người khác sửa. Hãy đọc lại trang (confluence_get_page) để lấy version mới.");
  });
  it("leaves Jira 409 on the default copy", () => {
    expect(formatError(mk(409, { statusText: "Conflict" }))).toBe("Lỗi Jira 409 Conflict");
  });
  it("names the service in network errors", async () => {
    const c = new HttpClient({ baseUrl: "https://nope.invalid", username: "u", password: "p", timeoutMs: 200, service: "Confluence" }, { retryDelayMs: 0 });
    const e = await c.get("/x").catch((x) => x);
    expect(formatError(e)).toMatch(/^Lỗi kết nối tới Confluence: /);
  });
});
