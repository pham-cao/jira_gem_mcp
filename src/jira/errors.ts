export interface JiraErrorInit {
  status: number;
  method: string;
  path: string;
  messages: string[];
  fieldErrors: Record<string, string>;
  captcha: boolean;
  statusText?: string;
}

export class JiraError extends Error {
  override name = "JiraError";
  readonly status: number;
  readonly method: string;
  readonly path: string;
  readonly messages: string[];
  readonly fieldErrors: Record<string, string>;
  readonly captcha: boolean;
  readonly statusText: string;

  constructor(init: JiraErrorInit) {
    super(`Jira ${init.status} ${init.method} ${init.path}`);
    this.status = init.status;
    this.method = init.method;
    this.path = init.path;
    this.messages = init.messages;
    this.fieldErrors = init.fieldErrors;
    this.captcha = init.captcha;
    this.statusText = init.statusText ?? "";
  }

  static async fromResponse(res: Response, method: string, path: string): Promise<JiraError> {
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
      }
    } catch {
      // Non-JSON body (e.g. HTML from a proxy): keep only the status.
    }
    const denied = res.headers.get("x-authentication-denied-reason") ?? "";
    return new JiraError({
      status: res.status,
      method,
      path,
      messages,
      fieldErrors,
      captcha: denied.toUpperCase().includes("CAPTCHA_CHALLENGE"),
      statusText: res.statusText,
    });
  }
}

const withMessages = (head: string, messages: string[]) => [head, ...messages].join("\n");

export function formatError(err: unknown): string {
  if (!(err instanceof JiraError)) return err instanceof Error ? err.message : String(err);
  if (err.captcha) return "Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập Jira trên trình duyệt một lần để mở khoá.";
  switch (err.status) {
    case 400:
      return [
        "Yêu cầu không hợp lệ (400):",
        ...err.messages,
        ...Object.entries(err.fieldErrors).map(([k, v]) => `- ${k}: ${v}`),
        "Gợi ý: dùng jira_get_create_meta hoặc jira_search_fields để kiểm tra field.",
      ].join("\n");
    case 401:
      return "Xác thực thất bại: sai username/password.";
    case 403:
      return withMessages("Không có quyền thực hiện thao tác.", err.messages);
    case 404:
      return `Không tìm thấy ${err.method} ${err.path} hoặc không có quyền xem.`;
    default:
      return withMessages(`Lỗi Jira ${err.status} ${err.statusText}`.trimEnd(), err.messages);
  }
}
