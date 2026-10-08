<div align="center">

# Jira & Confluence MCP Server

**Kết nối Claude Code (và mọi MCP client) với Jira Server và Confluence Server nội bộ, bằng chính tài khoản của bạn.**

![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF)
![Jira](https://img.shields.io/badge/Jira%20Server-8.x-0052CC?logo=jira&logoColor=white)
![Confluence](https://img.shields.io/badge/Confluence%20Server-6.x-172B4D?logo=confluence&logoColor=white)

</div>

---

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cài đặt](#cài-đặt)
- [Cấu hình](#cấu-hình)
- [Danh sách tool](#danh-sách-tool)
- [Ví dụ sử dụng](#ví-dụ-sử-dụng)
- [Bảo mật](#bảo-mật)
- [Giới hạn đã biết](#giới-hạn-đã-biết)
- [Phát triển](#phát-triển)
- [Tài liệu liên quan](#tài-liệu-liên-quan)

## Giới thiệu

`jira-server-mcp` là một [Model Context Protocol](https://modelcontextprotocol.io) server chạy qua stdio. Server cho phép AI assistant tìm kiếm, đọc và cập nhật dữ liệu trên:

| Hệ thống | Phiên bản đã kiểm tra | URL nội bộ |
|---|---|---|
| Jira Server | 8.5.19 | `https://pm.gem-corp.tech` |
| Confluence Server | 6.11.0 | `https://conf.gem-corp.tech` |

Cả hai hệ thống dùng **Basic Auth (username/password)**, vì các phiên bản này chưa hỗ trợ Personal Access Token. Server chạy trên máy của mỗi người, mọi thao tác đều theo đúng quyền của tài khoản bạn cấu hình.

## Tính năng

**Jira**
- Tìm issue bằng JQL; xem chi tiết issue, changelog và các field tuỳ chỉnh.
- Tạo, cập nhật, gán người và chuyển trạng thái issue.
- Comment, worklog, liên kết issue và attachment.
- Board và sprint (khi có Jira Software): xem, tạo, cập nhật, chuyển issue vào sprint.

**Confluence** (tuỳ chọn)
- Tìm trang bằng CQL; đọc trang, cây trang con và danh sách space.
- Tạo và sửa trang bằng **Markdown**: server tự chuyển sang storage XHTML (code block, bảng, panel…). Vẫn có thể dùng storage XHTML thô khi cần.
- Comment, label và attachment.

**Vận hành**
- Một tiến trình phục vụ cả Jira lẫn Confluence, dùng chung một bộ tài khoản.
- Chế độ chỉ đọc (`JIRA_READ_ONLY`) ẩn toàn bộ tool ghi.
- Kiểm tra đăng nhập ngay khi khởi động; thông báo lỗi rõ ràng (sai mật khẩu, CAPTCHA, thiếu quyền, xung đột phiên bản).
- Không gửi thông tin đăng nhập tới host khác cấu hình; không tự thử lại khi sai mật khẩu.

## Bắt đầu nhanh

Yêu cầu: **Node.js ≥ 20** và tài khoản Jira/Confluence đăng nhập được bằng username/password.

```bash
claude mcp add jira -s user \
  -e JIRA_BASE_URL=https://pm.gem-corp.tech \
  -e JIRA_USERNAME=<username> \
  -e JIRA_PASSWORD=<password> \
  -e CONFLUENCE_BASE_URL=https://conf.gem-corp.tech \
  -- npx -y git+https://github.com/pham-cao/jira_gem_mcp.git
```

Khởi động lại Claude Code, chạy `/mcp` để kiểm tra trạng thái `jira` là **connected**, rồi thử:

> *"Liệt kê các issue đang gán cho tôi"* hoặc *"Tìm trang Confluence về quy trình deploy"*

## Cài đặt

> Hướng dẫn chi tiết cho Claude Code, Claude Desktop, VS Code và Cursor, kèm bảng xử lý sự cố: **[docs/integration.md](docs/integration.md)**.

### Cách A — `npx` từ git (không cần clone)

Thêm vào `.mcp.json` của project hoặc `~/.claude.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "git+https://github.com/pham-cao/jira_gem_mcp.git"],
      "env": {
        "JIRA_BASE_URL": "https://pm.gem-corp.tech",
        "JIRA_USERNAME": "<username>",
        "JIRA_PASSWORD": "<password>",
        "CONFLUENCE_BASE_URL": "https://conf.gem-corp.tech"
      }
    }
  }
}
```

Lần chạy đầu npm tải mã nguồn và tự build (khoảng 30–60 giây). Muốn ghim phiên bản, thêm `#<tag>` hoặc `#<commit>` vào cuối URL.

### Cách B — clone và build

Khởi động nhanh hơn và không phụ thuộc mạng khi chạy. Nên dùng nếu `npx` bị timeout.

```bash
git clone https://github.com/pham-cao/jira_gem_mcp.git
cd jira_gem_mcp && npm ci && npm run build
```

Sau đó dùng cấu hình như cách A, thay `command`/`args` bằng:

```json
"command": "node",
"args": ["/đường/dẫn/jira_gem_mcp/dist/index.js"]
```

Cập nhật phiên bản mới: `git pull && npm ci && npm run build`, rồi khởi động lại client.

## Cấu hình

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|:---:|---|---|
| `JIRA_BASE_URL` | ✓ | — | URL Jira, vd `https://pm.gem-corp.tech` |
| `JIRA_USERNAME` | ✓ | — | Username Jira |
| `JIRA_PASSWORD` | ✓ | — | Mật khẩu Jira |
| `CONFLUENCE_BASE_URL` | | — | URL Confluence. Không đặt thì không có tool `confluence_*` |
| `CONFLUENCE_USERNAME` | | `JIRA_USERNAME` | Chỉ cần khi tài khoản Confluence khác Jira |
| `CONFLUENCE_PASSWORD` | | `JIRA_PASSWORD` | Chỉ cần khi mật khẩu Confluence khác Jira |
| `JIRA_READ_ONLY` | | `false` | `true` → chỉ bật tool đọc (áp dụng cho cả Confluence) |
| `JIRA_TIMEOUT_MS` | | `30000` | Timeout mỗi request (ms) |
| `JIRA_INSECURE_TLS` | | `false` | `true` → bỏ kiểm tra chứng chỉ TLS. Nên dùng `NODE_EXTRA_CA_CERTS` thay thế |

**Khi khởi động**, server:
1. Gọi `/rest/api/2/myself` để kiểm tra đăng nhập Jira.
2. Thử API agile; chỉ bật tool board/sprint khi Jira có Jira Software.
3. Nếu có `CONFLUENCE_BASE_URL`: gọi `/rest/api/user/current` và từ chối nếu bị coi là người dùng ẩn danh.

Bất kỳ bước nào thất bại, server thoát ngay và in lý do ra stderr (tiền tố `[jira-mcp]`).

## Danh sách tool

> Tham số, giá trị mặc định, kết quả và ví dụ của từng tool: **[docs/tools.md](docs/tools.md)**.
>
> ✎ = tool ghi, bị ẩn khi `JIRA_READ_ONLY=true`.

### Jira — 20 tool

| Nhóm | Tool |
|---|---|
| Issue | `jira_search` · `jira_get_issue` · `jira_create_issue` ✎ · `jira_update_issue` ✎ · `jira_assign_issue` ✎ |
| Workflow | `jira_get_transitions` · `jira_transition_issue` ✎ |
| Comment | `jira_get_comments` · `jira_add_comment` ✎ · `jira_update_comment` ✎ |
| Worklog | `jira_get_worklogs` · `jira_add_worklog` ✎ |
| Link | `jira_list_link_types` · `jira_link_issues` ✎ |
| Attachment | `jira_download_attachment` · `jira_upload_attachment` ✎ |
| Metadata | `jira_list_projects` · `jira_get_create_meta` · `jira_search_fields` · `jira_search_users` |

### Jira Agile — 6 tool (khi có Jira Software)

`jira_list_boards` · `jira_list_sprints` · `jira_get_sprint_issues` · `jira_create_sprint` ✎ · `jira_update_sprint` ✎ · `jira_move_issues_to_sprint` ✎

### Confluence — 13 tool (khi có `CONFLUENCE_BASE_URL`)

| Nhóm | Tool |
|---|---|
| Trang | `confluence_search` · `confluence_get_page` · `confluence_get_page_children` · `confluence_list_spaces` · `confluence_create_page` ✎ · `confluence_update_page` ✎ |
| Comment | `confluence_get_comments` · `confluence_add_comment` ✎ |
| Label | `confluence_get_labels` · `confluence_add_labels` ✎ |
| Attachment | `confluence_list_attachments` · `confluence_download_attachment` · `confluence_upload_attachment` ✎ |

### Quy ước dữ liệu

| | Jira | Confluence |
|---|---|---|
| Định danh người dùng | `name` (username) | `username` |
| Nội dung | Wiki markup (`*đậm*`, `{code}…{code}`) | Markdown (mặc định) hoặc storage XHTML (`format: "storage"`) |
| Truy vấn | JQL | CQL |
| Field tuỳ chỉnh | `customFields` theo id (tra bằng `jira_search_fields`) | — |

## Ví dụ sử dụng

```text
Tóm tắt các issue trong sprint hiện tại của board ABC, nhóm theo người được gán.
Tạo bug trong project ABC: "Lỗi đăng nhập SSO", priority High, gán cho tôi.
Log 2h vào ABC-123 cho hôm nay với nội dung "review code".
Chuyển ABC-123 sang Done và thêm comment "Đã deploy lên staging".
Đọc trang Confluence "Quy trình release" trong space DEV và liệt kê các bước.
Tạo trang con dưới trang 123456 với nội dung là release note của sprint vừa xong.
```

## Bảo mật

> [!WARNING]
> Mật khẩu là thông tin đăng nhập đầy đủ vào Jira/Confluence. **Không commit** `.mcp.json`, `~/.claude.json` hay `.env` có chứa mật khẩu. Nên đặt quyền `chmod 600` cho các file này.

- **Attachment và đường dẫn local.** Bốn tool `jira_download_attachment`, `jira_upload_attachment`, `confluence_download_attachment` và `confluence_upload_attachment` đọc/ghi **đường dẫn bất kỳ** trên máy. Nội dung do người khác viết trên Jira/Confluence có thể chứa prompt injection, dụ model ghi đè file nhạy cảm (`~/.bashrc`) hoặc upload file bí mật (`~/.ssh/id_rsa`). Luôn đọc kỹ tham số đường dẫn trước khi duyệt, và **không** đưa các tool này vào danh sách tự động cho phép.
- **Chế độ chỉ đọc.** Hai tool download vẫn bật khi `JIRA_READ_ONLY=true`, vì chúng chỉ đọc từ server dù có ghi file ra máy.
- **CAPTCHA.** Nhập sai mật khẩu nhiều lần, Jira/Confluence sẽ yêu cầu CAPTCHA và từ chối mọi request API. Đăng nhập trên trình duyệt một lần để mở khoá.
- **TLS.** `JIRA_INSECURE_TLS=true` tắt kiểm tra chứng chỉ cho cả tiến trình, dễ bị tấn công MITM. Hãy dùng `NODE_EXTRA_CA_CERTS=/đường/dẫn/ca.pem` để tin CA nội bộ.
- **Credential.** Server không log mật khẩu, không retry khi sai mật khẩu, và từ chối tải file từ host khác host đã cấu hình.

## Giới hạn đã biết

- **Không có thao tác xoá** (issue, comment, worklog, attachment, sprint, trang). Các thao tác không hoàn tác được hãy làm trên giao diện web.
- **Markdown làm mất một phần nội dung Confluence.** Macro, ảnh, link trang, mention và định dạng bảng không chuyển được sang Markdown. Vì vậy `confluence_update_page` **từ chối** ghi đè bằng Markdown lên trang có các thành phần này. Hãy sửa bằng `format: "storage"`, hoặc truyền `allowLossyMarkdown: true` nếu chấp nhận mất.
- **Trang dài bị cắt** khi đọc (mặc định 50 000 ký tự, trả `truncated: true`). Không ghi lại nội dung đã bị cắt.
- **Không hỗ trợ** di chuyển trang, phân quyền và blog post riêng (blog post vẫn tìm và sửa được qua CQL).

## Phát triển

```bash
npm ci
npm test                 # unit + tool tests (mock HTTP, không gọi server thật)
npm run build            # biên dịch ra dist/
cp .env.example .env     # điền thông tin đăng nhập để chạy smoke test
npm run smoke            # chỉ gọi tool đọc trên Jira (và Confluence nếu có CONFLUENCE_BASE_URL)
npx @modelcontextprotocol/inspector node dist/index.js   # thử tool bằng giao diện web
```

**Cấu trúc mã nguồn**

```text
src/
├── index.ts            # entry point stdio: config → kiểm tra đăng nhập → server
├── server.ts           # startup checks, đăng ký nhóm tool
├── config.ts           # đọc và validate biến môi trường
├── http/               # HttpClient (Basic Auth, retry GET, timeout) và HttpError
├── jira/               # client, format kết quả, cache field
├── confluence/         # chuyển đổi Markdown ↔ storage, format kết quả
└── tools/              # định nghĩa tool MCP theo nhóm (jira_*, confluence/*)
```

Công nghệ: TypeScript (ESM), `@modelcontextprotocol/sdk`, `zod`, `marked`, `turndown`; kiểm thử bằng `vitest` + `msw`.

## Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [docs/integration.md](docs/integration.md) | Cài đặt cho từng client, prompt mẫu, xử lý sự cố |
| [docs/tools.md](docs/tools.md) | Tham số và ví dụ chi tiết của từng tool |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Thiết kế (design spec) |
