# Jira Server MCP — Design Spec

- **Ngày:** 2026-10-08
- **Trạng thái:** Chờ review
- **Mục tiêu:** MCP server (stdio) cho phép Claude Code / MCP client đọc và thao tác Jira Server nội bộ của GEM bằng tài khoản Jira của từng người.

## 1. Bối cảnh & ràng buộc

| Mục | Giá trị |
|---|---|
| Jira | Jira Server **8.5.19** (`deploymentType: Server`), `https://pm.gem-corp.tech` |
| Xác thực | Basic Auth (username + password). PAT không khả dụng (cần ≥ 8.14) |
| REST API | `/rest/api/2` (core), `/rest/agile/1.0` (Jira Software — chưa xác nhận, phát hiện lúc khởi động) |
| Người dùng | Cả team; mỗi người chạy local với tài khoản riêng |
| Ngôn ngữ | TypeScript, Node.js ≥ 20, `@modelcontextprotocol/sdk`, `zod` |
| Transport | stdio |

Khác biệt Server 8.5 so với Cloud cần tuân thủ:
- User định danh bằng `name` (username), **không** dùng `accountId`.
- Description/comment là **wiki markup** (chuỗi), không phải ADF.
- `started` của worklog có dạng `yyyy-MM-dd'T'HH:mm:ss.SSSZ` (vd `2026-10-08T09:00:00.000+0700`).
- Create metadata dùng `GET /rest/api/2/issue/createmeta?projectKeys=...&expand=projects.issuetypes.fields`.

## 2. Kiến trúc

Hướng tiếp cận: tự viết REST client mỏng dựa trên `fetch` built-in + mỗi thao tác một tool MCP có schema zod. Không dùng thư viện Jira bên thứ ba.

```
jira_mcp/
├── src/
│   ├── index.ts            # entry: load config → JiraClient → startup checks → register tools → stdio
│   ├── config.ts           # đọc & validate env (zod)
│   ├── jira/
│   │   ├── client.ts       # JiraClient: fetch + Basic Auth + error mapping + retry + timeout
│   │   ├── errors.ts       # JiraError + hàm format lỗi cho Claude
│   │   └── format.ts       # rút gọn issue/comment/worklog/sprint/user; truncate; paging meta
│   └── tools/
│       ├── issues.ts       # search, get, create, update, assign, transitions, transition
│       ├── comments.ts     # get, add, update
│       ├── worklogs.ts     # get, add
│       ├── links.ts        # list link types, link issues
│       ├── attachments.ts  # upload, download
│       ├── meta.ts         # projects, create meta, fields, users
│       └── agile.ts        # boards, sprints, sprint issues, move, create/update sprint
├── test/
├── scripts/smoke.ts
├── package.json
└── README.md
```

Mỗi file trong `tools/` export `register(server: McpServer, client: JiraClient, opts: { readOnly: boolean })`. Tool ghi chỉ được đăng ký khi `readOnly === false`.

**Luồng:** Claude gọi tool → zod validate input → handler gọi `JiraClient` → `format.ts` rút gọn → trả `content: [{type: "text", text: JSON}]`. Lỗi `JiraError` → trả `isError: true` với thông báo đã format.

## 3. Cấu hình

| Biến môi trường | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `JIRA_BASE_URL` | ✓ | — | vd `https://pm.gem-corp.tech`; bỏ `/` cuối |
| `JIRA_USERNAME` | ✓ | — | username Jira |
| `JIRA_PASSWORD` | ✓ | — | mật khẩu Jira |
| `JIRA_READ_ONLY` | | `false` | `true` → chỉ đăng ký tool đọc |
| `JIRA_INSECURE_TLS` | | `false` | `true` → bỏ kiểm tra chứng chỉ TLS (đặt `NODE_TLS_REJECT_UNAUTHORIZED=0` trong `index.ts` trước mọi request) |
| `JIRA_TIMEOUT_MS` | | `30000` | timeout mỗi request |

Boolean chấp nhận `true/false/1/0` (không phân biệt hoa thường); giá trị khác → lỗi cấu hình.

**Khởi động:**
1. Validate config; lỗi → in thông báo rõ ràng ra stderr, `exit(1)`.
2. `GET /rest/api/2/myself`. 401/403 → in lỗi (kèm hướng dẫn CAPTCHA nếu có) và `exit(1)`, không retry.
3. `GET /rest/agile/1.0/board?maxResults=1`. 2xx → đăng ký tool agile; còn lại → bỏ qua và log ra stderr.
4. Kết nối `StdioServerTransport`.

**Phân phối:** mỗi người cấu hình trong `.mcp.json` / `~/.claude.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "git+https://<git-nội-bộ>/jira-mcp.git"],
      "env": {
        "JIRA_BASE_URL": "https://pm.gem-corp.tech",
        "JIRA_USERNAME": "<username>",
        "JIRA_PASSWORD": "<password>"
      }
    }
  }
}
```

Hoặc clone + `npm ci && npm run build` rồi dùng `"command": "node", "args": ["/path/dist/index.js"]`. `package.json` khai báo `bin` và script `prepare` để build khi cài qua git URL.

README cảnh báo không commit file cấu hình chứa mật khẩu.

## 4. Danh sách tool

Tất cả có prefix `jira_`. Đường dẫn dưới đây tương đối với `/rest/api/2` trừ khi ghi rõ.

### 4.1 Tool đọc (luôn đăng ký)

| Tool | Endpoint | Input chính | Ghi chú |
|---|---|---|---|
| `jira_search` | `POST /search` | `jql`, `fields?`, `maxResults?` (mặc định 20, tối đa 100), `startAt?` | trả issue rút gọn + paging meta |
| `jira_get_issue` | `GET /issue/{key}` | `issueKey`, `expand?` | summary, status, issuetype, priority, assignee, reporter, labels, description, sprint, parent, subtasks, issuelinks, attachments (id, filename, size, mimeType), 10 comment mới nhất |
| `jira_get_comments` | `GET /issue/{key}/comment` | `issueKey`, `startAt?`, `maxResults?` | |
| `jira_get_worklogs` | `GET /issue/{key}/worklog` | `issueKey` | |
| `jira_get_transitions` | `GET /issue/{key}/transitions` | `issueKey` | id, name, to-status |
| `jira_list_projects` | `GET /project` | — | key, name, id |
| `jira_get_create_meta` | `GET /issue/createmeta` | `projectKey`, `issueType?` | issue types + fields (id, name, required, allowedValues rút gọn) |
| `jira_search_fields` | `GET /field` | `query?` | lọc theo tên/ID không phân biệt hoa thường (lọc phía client) |
| `jira_search_users` | `GET /user/search` | `query`, `maxResults?` | dùng param `username=`; trả name, displayName, emailAddress, active |
| `jira_list_link_types` | `GET /issueLinkType` | — | |
| `jira_download_attachment` | `GET /attachment/{id}` → GET `content` URL | `attachmentId`, `destPath`, `overwrite?` (mặc định false) | ghi file local; trả path + size |

### 4.2 Tool ghi (không đăng ký khi `JIRA_READ_ONLY=true`)

| Tool | Endpoint | Input chính | Ghi chú |
|---|---|---|---|
| `jira_create_issue` | `POST /issue` | `projectKey`, `issueType` (tên), `summary`, `description?`, `assignee?`, `priority?`, `labels?`, `parentKey?`, `customFields?` (record) | trả `{key, url}` |
| `jira_update_issue` | `PUT /issue/{key}` | `issueKey`, các field như trên (đều optional), `customFields?` | chỉ gửi field được truyền; ít nhất 1 field |
| `jira_assign_issue` | `PUT /issue/{key}/assignee` | `issueKey`, `assignee` (string hoặc `null`) | body `{name}` |
| `jira_transition_issue` | `POST /issue/{key}/transitions` | `issueKey`, `transition` (id hoặc tên), `comment?`, `resolution?`, `fields?` | tên khớp không phân biệt hoa thường; không khớp → lỗi liệt kê transitions hợp lệ |
| `jira_add_comment` | `POST /issue/{key}/comment` | `issueKey`, `body` | |
| `jira_update_comment` | `PUT /issue/{key}/comment/{id}` | `issueKey`, `commentId`, `body` | |
| `jira_add_worklog` | `POST /issue/{key}/worklog` | `issueKey`, `timeSpent` (vd "2h 30m"), `started?` (ISO; mặc định now), `comment?`, `adjustEstimate?` (`auto`/`leave`/`new`/`manual`), `newEstimate?`, `reduceBy?` | chuyển `started` sang định dạng Jira |
| `jira_link_issues` | `POST /issueLink` | `type` (tên), `inwardIssue`, `outwardIssue`, `comment?` | |
| `jira_upload_attachment` | `POST /issue/{key}/attachments` | `issueKey`, `filePath` | multipart, header `X-Atlassian-Token: no-check`; từ chối file > 10MB hoặc không tồn tại |

### 4.3 Tool agile (chỉ khi probe agile thành công)

| Tool | Endpoint (`/rest/agile/1.0`) | Input chính | Loại |
|---|---|---|---|
| `jira_list_boards` | `GET /board` | `projectKey?`, `name?`, `type?`, `startAt?`, `maxResults?` | đọc |
| `jira_list_sprints` | `GET /board/{id}/sprint` | `boardId`, `state?` (mặc định `active,future`) | đọc |
| `jira_get_sprint_issues` | `GET /sprint/{id}/issue` | `sprintId`, `jql?`, `startAt?`, `maxResults?` | đọc |
| `jira_move_issues_to_sprint` | `POST /sprint/{id}/issue` | `sprintId`, `issueKeys[]` (tối đa 50) | ghi |
| `jira_create_sprint` | `POST /sprint` | `boardId`, `name`, `startDate?`, `endDate?`, `goal?` | ghi |
| `jira_update_sprint` | `POST /sprint/{id}` | `sprintId`, `name?`, `state?` (`active`/`closed`), `startDate?`, `endDate?`, `goal?` | ghi (partial update) |

### 4.4 Ngoài phạm vi

Xoá issue/comment/worklog/attachment/sprint; quản lý version, component, permission, workflow, filter, dashboard; HTTP transport dùng chung.

## 5. JiraClient

```ts
class JiraClient {
  constructor(cfg: { baseUrl; username; password; timeoutMs; insecureTls })
  get<T>(path, query?): Promise<T>
  post<T>(path, body?): Promise<T>
  put<T>(path, body?): Promise<T>
  postMultipart<T>(path, form: FormData): Promise<T>
  getBinary(url): Promise<{ data: ArrayBuffer; contentType: string }>
}
```

- Header: `Authorization: Basic base64(user:pass)`, `Accept: application/json`, `Content-Type: application/json` khi có body.
- `path` bắt đầu bằng `/rest/...`; client ghép với `baseUrl`.
- 204 / body rỗng → trả `undefined`.
- Timeout bằng `AbortSignal.timeout(timeoutMs)`.
- **Retry:** chỉ với GET, khi 5xx / lỗi mạng / timeout: thử lại 1 lần sau 1 giây. Không bao giờ retry 4xx, không retry POST/PUT.

## 6. Xử lý lỗi

`JiraError { status: number; messages: string[]; fieldErrors: Record<string,string>; captcha: boolean }` — parse từ body `{errorMessages, errors}` của Jira (body không phải JSON → dùng status text).

| Status | Thông báo trả cho Claude |
|---|---|
| 400 | Liệt kê `errorMessages` + từng `field: message`; gợi ý `jira_get_create_meta` / `jira_search_fields` |
| 401 | "Xác thực thất bại: sai username/password." |
| 403 | "Không có quyền thực hiện thao tác." Nếu header `X-Authentication-Denied-Reason` chứa `CAPTCHA_CHALLENGE`: "Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập Jira trên trình duyệt một lần để mở khoá." |
| 404 | "Không tìm thấy <resource> hoặc không có quyền xem." |
| 5xx / mạng / timeout | Thông báo kèm status/lý do sau khi đã retry (GET) |

- Lỗi validate input của zod do SDK MCP xử lý.
- Lỗi không phải `JiraError` (vd file không tồn tại) → `isError: true` với `error.message`.
- Log chỉ ra **stderr**; không bao giờ log mật khẩu hay header `Authorization`.

## 7. Định dạng output

- JSON (`JSON.stringify(x, null, 2)`) đã rút gọn: bỏ `self`, `avatarUrls`, `expand`, `iconUrl`.
- User → `{name, displayName}`; status/priority/issuetype/resolution → tên.
- Kết quả có phân trang kèm `{total, startAt, maxResults, hasMore}` với `hasMore = startAt + items.length < total`.
- Chuỗi dài > 10.000 ký tự (description, comment body) bị cắt kèm `…[truncated]` và gợi ý tool để xem đầy đủ.
- Tool ghi trả kết quả tối thiểu, vd `{key, url: "<baseUrl>/browse/<key>"}` hoặc `{ok: true}`.
- Field sprint lấy từ custom field có `schema.custom === "com.pyxis.greenhopper.jira:gh-sprint"`. ID field này được tìm qua `GET /field` một lần và cache trong bộ nhớ. Giá trị sprint trên Jira 8.5 có thể là chuỗi `com.atlassian.greenhopper.service.sprint.Sprint@...[id=..,name=..,state=..]` → parse ra `{id, name, state}`.

## 8. Kiểm thử

**Công cụ:** `vitest`, `msw` (mock HTTP). Không gọi server thật trong test tự động.

- **config:** thiếu biến → lỗi; parse boolean; chuẩn hoá base URL.
- **client:** header Basic Auth; map 400/401/403(+CAPTCHA)/404/5xx; retry GET 1 lần, không retry POST; timeout; 204 → undefined.
- **format:** rút gọn issue, truncate, paging meta, parse chuỗi sprint kiểu cũ.
- **tools:** dùng `McpServer` + `Client` của SDK qua `InMemoryTransport`. Mỗi tool ≥ 1 case thành công (kiểm tra method/path/body gửi đi) và ≥ 1 case lỗi. Các case đặc biệt:
  - `jira_transition_issue` khớp tên không phân biệt hoa thường; tên sai → lỗi liệt kê transitions.
  - `JIRA_READ_ONLY=true` → tool ghi không có trong `listTools`.
  - Agile probe 404 → tool agile không có trong `listTools`.
  - Upload gửi multipart + `X-Atlassian-Token: no-check`; file > 10MB bị từ chối.
  - Download không ghi đè file có sẵn khi `overwrite` không được bật.
- **Smoke thủ công:** `npm run smoke` đọc `.env`, chỉ gọi thao tác đọc (`myself`, search `assignee = currentUser()`, get issue đầu tiên, list boards nếu có). Có thể kiểm tra tương tác bằng `npx @modelcontextprotocol/inspector`.

## 9. Tiêu chí hoàn thành

1. `npm run build` và `npm test` pass.
2. `npm run smoke` chạy thành công với `pm.gem-corp.tech`.
3. Claude Code kết nối được qua `.mcp.json`, liệt kê đúng tool (agile tuỳ theo probe), thực hiện được search + get issue.
4. README hướng dẫn cài đặt (npx git URL và clone), cấu hình env, cảnh báo bảo mật mật khẩu, danh sách tool.
