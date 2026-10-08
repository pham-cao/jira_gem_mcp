export type Service = "Jira" | "Confluence";

export interface HttpErrorInit {
  status: number;
  method: string;
  path: string;
  messages: string[];
  fieldErrors: Record<string, string>;
  captcha: boolean;
  statusText?: string;
  service?: Service;
}

export class HttpError extends Error {
  override name: string;
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly messages: string[];
  readonly fieldErrors: Record<string, string>;
  readonly captcha: boolean;
  readonly statusText: string;
  readonly service: Service;

  constructor(init: HttpErrorInit) {
    const service = init.service ?? "Jira";
    super(`${service} ${init.status} ${init.method} ${init.path}`);
    this.service = service;
    this.name = service === "Jira" ? "JiraError" : "HttpError";
    this.status = init.status;
    this.method = init.method;
    this.path = init.path;
    this.messages = init.messages;
    this.fieldErrors = init.fieldErrors;
    this.captcha = init.captcha;
    this.statusText = init.statusText ?? "";
  }

  static async fromResponse(res: Response, method: string, path: string, service: Service = "Jira"): Promise<HttpError> {
    let messages: string[] = [];
    let fieldErrors: Record<string, string> = {};
    const text = await res.text().catch(() => "");
    try {
      const body = text ? JSON.parse(text) : undefined;
      if (body && typeof body === "object") {
        if (Array.isArray(body.errorMessages)) messages = body.errorMessages.map(String);
        if (body.errors && typeof body.errors === "object") {
          fieldErrors = Object.fromEntries(Object.entries(body.errors).map(([k, v]) => [k, String(v)]));
        }
        // Confluence: { message, data: { errors: [{ message: { translation } }] } }
        if (service === "Confluence" && typeof body.message === "string") messages.push(body.message);
        if (service === "Confluence" && Array.isArray(body.data?.errors)) {
          for (const e of body.data.errors) {
            const t = e?.message?.translation;
            if (typeof t === "string") messages.push(t);
          }
        }
      }
    } catch {
      // Non-JSON body (e.g. HTML from a proxy): keep only the status.
    }
    const denied = res.headers.get("x-authentication-denied-reason") ?? "";
    const seraph = res.headers.get("x-seraph-loginreason") ?? "";
    return new HttpError({
      service,
      status: res.status,
      method,
      path,
      messages,
      fieldErrors,
      captcha: denied.toUpperCase().includes("CAPTCHA_CHALLENGE") || (service === "Confluence" && seraph.toUpperCase().includes("AUTHENTICATION_DENIED")),
      statusText: res.statusText,
    });
  }
}

const withMessages = (head: string, messages: string[]) => [head, ...messages].join("\n");

const TLS_CODE = /CERT|SSL|TLS|UNABLE_TO_VERIFY/i;

function formatPlainError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const service = (err as { service?: Service }).service ?? "Jira";
  if (err.name === "TimeoutError") return `${service} không phản hồi trong thời gian cho phép (JIRA_TIMEOUT_MS).`;
  const cause = err.cause as { code?: string; message?: string } | undefined;
  if (!cause || typeof cause !== "object") return err.message;
  const code = cause.code ?? "";
  const detail = [code, cause.message].filter(Boolean).join(": ");
  const hint = TLS_CODE.test(code)
    ? `\nGợi ý: nếu ${service} dùng chứng chỉ tự ký hoặc CA nội bộ, đặt JIRA_INSECURE_TLS=true (hoặc NODE_EXTRA_CA_CERTS).`
    : "";
  return `Lỗi kết nối tới ${service}: ${err.message} (${detail})${hint}`;
}

// Confluence page/comment writes carry storage XHTML; attachment and label sub-paths do not.
const isContentWrite = (err: HttpError) =>
  (err.method === "POST" || err.method === "PUT") && err.path.startsWith("/rest/api/content") && !/\/child\/attachment|\/label/.test(err.path);

export function formatError(err: unknown): string {
  if (!(err instanceof HttpError)) return formatPlainError(err);
  if (err.captcha) return `Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập ${err.service} trên trình duyệt một lần để mở khoá.`;
  switch (err.status) {
    case 400:
      return [
        "Yêu cầu không hợp lệ (400):",
        ...err.messages,
        ...Object.entries(err.fieldErrors).map(([k, v]) => `- ${k}: ${v}`),
        ...(err.service === "Jira"
          ? ["Gợi ý: dùng jira_get_create_meta hoặc jira_search_fields để kiểm tra field."]
          : isContentWrite(err)
            ? ['Gợi ý: nội dung storage XHTML có thể không hợp lệ; thử format: "markdown".']
            : []),
      ].join("\n");
    case 401:
      return "Xác thực thất bại: sai username/password.";
    case 403:
      return withMessages("Không có quyền thực hiện thao tác.", err.messages);
    case 404:
      return `Không tìm thấy ${err.method} ${err.path} hoặc không có quyền xem.`;
    case 409:
      if (err.service === "Confluence") {
        return withMessages(
          "Xung đột khi ghi (409): trang vừa bị người khác sửa. Hãy đọc lại trang (confluence_get_page) để lấy version mới.",
          err.messages,
        );
      }
    // falls through: Jira keeps the default copy
    default:
      return withMessages(`Lỗi ${err.service} ${err.status} ${err.statusText}`.trimEnd(), err.messages);
  }
}
