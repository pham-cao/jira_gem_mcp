import { describe, expect, it } from "vitest";
import { JiraError, formatError } from "../src/jira/errors.js";

const mk = (status: number, extra: Partial<ConstructorParameters<typeof JiraError>[0]> = {}) =>
  new JiraError({ status, method: "GET", path: "/rest/api/2/issue/X-1", messages: [], fieldErrors: {}, captcha: false, ...extra });

describe("JiraError.fromResponse", () => {
  it("parses errorMessages and field errors", async () => {
    const res = new Response(JSON.stringify({ errorMessages: ["a"], errors: { summary: "required" } }), { status: 400 });
    const e = await JiraError.fromResponse(res, "POST", "/rest/api/2/issue");
    expect(e.status).toBe(400);
    expect(e.messages).toEqual(["a"]);
    expect(e.fieldErrors).toEqual({ summary: "required" });
  });

  it("tolerates an HTML body", async () => {
    const res = new Response("<html>502</html>", { status: 502, statusText: "Bad Gateway", headers: { "Content-Type": "text/html" } });
    const e = await JiraError.fromResponse(res, "GET", "/x");
    expect(e.status).toBe(502);
    expect(e.messages).toEqual([]);
  });

  it("tolerates an empty body", async () => {
    const e = await JiraError.fromResponse(new Response(null, { status: 500 }), "GET", "/x");
    expect(e.status).toBe(500);
  });

  it("detects CAPTCHA challenge", async () => {
    const res = new Response("", {
      status: 403,
      headers: { "X-Authentication-Denied-Reason": "CAPTCHA_CHALLENGE; login-url=https://jira/login.jsp" },
    });
    expect((await JiraError.fromResponse(res, "GET", "/x")).captcha).toBe(true);
  });
});

describe("formatError", () => {
  it("formats 400 with field errors", () => {
    expect(formatError(mk(400, { messages: ["bad"], fieldErrors: { summary: "required" } }))).toBe(
      "Yêu cầu không hợp lệ (400):\nbad\n- summary: required\nGợi ý: dùng jira_get_create_meta hoặc jira_search_fields để kiểm tra field.",
    );
  });

  it("formats 401", () => {
    expect(formatError(mk(401))).toBe("Xác thực thất bại: sai username/password.");
  });

  it("formats 403 captcha", () => {
    expect(formatError(mk(403, { captcha: true }))).toBe(
      "Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập Jira trên trình duyệt một lần để mở khoá.",
    );
  });

  it("formats 403 with Jira messages", () => {
    expect(formatError(mk(403, { messages: ["nope"] }))).toBe("Không có quyền thực hiện thao tác.\nnope");
  });

  it("formats 404", () => {
    expect(formatError(mk(404))).toBe("Không tìm thấy GET /rest/api/2/issue/X-1 hoặc không có quyền xem.");
  });

  it("formats other statuses", () => {
    expect(formatError(mk(502, { statusText: "Bad Gateway", messages: ["m"] }))).toBe("Lỗi Jira 502 Bad Gateway\nm");
  });

  it("passes through plain errors", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
    expect(formatError("x")).toBe("x");
  });
});
