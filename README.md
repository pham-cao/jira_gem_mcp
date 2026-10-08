<div align="center">

# Jira & Confluence MCP Server

**Kết nối Claude Code (và mọi MCP client) với Jira Server và Confluence Server nội bộ, bằng chính tài khoản của bạn — kèm skill tự ghi logwork và điền daily meeting theo phong cách Agile.**

![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-ESM-3178C6?logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-stdio-6E56CF)
![Jira](https://img.shields.io/badge/Jira%20Server-8.x-0052CC?logo=jira&logoColor=white)
![Confluence](https://img.shields.io/badge/Confluence%20Server-6.x-172B4D?logo=confluence&logoColor=white)
![Claude Code plugin](https://img.shields.io/badge/Claude%20Code-plugin-D97757)

</div>

---

## Mục lục

- [Giới thiệu](#giới-thiệu)
- [Tính năng](#tính-năng)
- [Bắt đầu nhanh](#bắt-đầu-nhanh)
- [Cài đặt](#cài-đặt)
- [Skill logwork](#skill-logwork)
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

Repo đồng thời là **Claude Code plugin `gem-jira`** (marketplace `gem-tools`): cài một lần là có cả MCP server lẫn skill [`logwork`](#skill-logwork).

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

**Logwork & Daily** (plugin `gem-jira`)
- Ghi lại task Jira đang làm, giờ bắt đầu/kết thúc từng phiên và việc đã làm vào `./logwork/`.
- Đề xuất worklog Jira (làm tròn 15 phút) và chỉ ghi khi bạn đồng ý; không log trùng phiên.
- Cuối ngày điền trang daily meeting trên Confluence (A. Yesterday / B. Today / C. Problems): chỉ sửa đúng ô của bạn, xem trước rồi mới ghi.

**Vận hành**
- Một tiến trình phục vụ cả Jira lẫn Confluence, dùng chung một bộ tài khoản.
- Chế độ chỉ đọc (`JIRA_READ_ONLY`) ẩn toàn bộ tool ghi.
- Kiểm tra đăng nhập ngay khi khởi động; thông báo lỗi rõ ràng (sai mật khẩu, CAPTCHA, thiếu quyền, xung đột phiên bản).
- Không gửi thông tin đăng nhập tới host khác cấu hình; không tự thử lại khi sai mật khẩu.

## Bắt đầu nhanh

Yêu cầu: **Node.js ≥ 20**, **Claude Code** và tài khoản Jira/Confluence đăng nhập được bằng username/password.

```text
/plugin marketplace add pham-cao/jira_gem_mcp
/plugin install gem-jira@gem-tools
```

Nhập `username` và `password` khi được hỏi, khởi động lại Claude Code, chạy `/mcp` để kiểm tra server `jira` đã **connected**, rồi thử:

> *"Liệt kê các issue đang gán cho tôi"* · *"Làm task ABC-123"* · *"Điền daily"*

Dùng client khác (Claude Desktop, VS Code, Cursor) hoặc không muốn cài plugin? Xem [Cách A / Cách B](#cách-a--npx-từ-git-không-cần-clone).

## Cài đặt

> Hướng dẫn chi tiết cho Claude Code, Claude Desktop, VS Code và Cursor, kèm bảng xử lý sự cố: **[docs/integration.md](docs/integration.md)**.

### Cài dưới dạng plugin (khuyến nghị)

Plugin `gem-jira` gồm MCP server và skill `logwork`, cài bằng hai lệnh trong Claude Code:

```text
/plugin marketplace add pham-cao/jira_gem_mcp
/plugin install gem-jira@gem-tools
```

Khi cài, Claude Code hỏi các giá trị cấu hình:

| Mục | Mặc định | Ghi chú |
|---|---|---|
| Jira URL (`jira_base_url`) | `https://pm.gem-corp.tech` | |
| Confluence URL (`confluence_base_url`) | `https://conf.gem-corp.tech` | |
| Username (`username`) | — | Bắt buộc; dùng chung cho Jira và Confluence |
| Password (`password`) | — | Bắt buộc; lưu trong secure storage |

Nếu trước đó bạn đã thêm server `jira` bằng `claude mcp add`, hãy gỡ bản cũ để không bị trùng tool: `claude mcp remove jira -s user` (hoặc `-s local`, hoặc xoá mục `jira` khỏi `.mcp.json` của project); kiểm tra lại bằng `claude mcp list`.

Sau khi cài, CLI có thể báo một số mục userConfig "not yet set": các mục URL đã có giá trị mặc định, bỏ qua được khi đã nhập `username` và `password`.

Hai cách dưới đây (A, B) dành cho client khác hoặc khi không dùng plugin; khi đó không có skill `logwork`.

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

## Skill logwork

Skill `logwork` (có trong plugin `gem-jira`) ghi lại thời gian làm task Jira trên máy bạn, đề xuất worklog và điền daily meeting trên Confluence. Skill tự kích hoạt khi bạn giao task để làm (vd *"làm task ABC-123"*, *"fix lỗi …/browse/ABC-123"*). Chỉ hỏi về một issue thì không bắt đầu ghi giờ. Hoặc gọi trực tiếp:

| Lệnh | Tác dụng |
|---|---|
| `/gem-jira:logwork start ABC-123` | Bắt đầu task: lấy summary từ Jira, mở phiên mới (giờ lấy theo đồng hồ máy bằng lệnh `node`, không ước lượng) trong `./logwork/YYYY-MM-DD.md` |
| `/gem-jira:logwork stop` | Kết thúc task: đóng phiên, đề xuất worklog (làm tròn lên 15 phút), **hỏi bạn trước** khi gọi `jira_add_worklog`. Phiên đã log được đánh dấu `[worklog <id>]` ngay trong file |
| `/gem-jira:logwork daily` | Dựng nội dung A (Yesterday) / B (Today: task dở trong logwork hôm nay + task In Progress của bạn cùng dự án) / C (Problems), xem trước bằng `confluence_fill_daily` với `preview: true`, chỉ ghi lên Confluence sau khi bạn xác nhận |

- Thư mục `./logwork/` nằm trong repo đang làm việc và được tự thêm vào `.git/info/exclude`, nên **không bị commit**.
- Lần đầu dùng trong một repo, skill hỏi **mã dự án Jira** của repo (vd `ABC`) và lưu vào `./logwork/config.json`. Mục B của daily chỉ lấy task Jira **cùng mã dự án** đó; giao task thuộc dự án khác thì skill hỏi lại trước khi ghi.
- `./logwork/config.json` cũng lưu link và `pageId` của trang daily; skill hỏi một lần nếu chưa có.
- Daily được điền vào ô của **ngày làm việc kế tiếp** (bỏ thứ 7, chủ nhật).
- Skill không bao giờ ghi worklog hoặc daily khi bạn chưa đồng ý rõ ràng.

Ví dụ một mục trong `./logwork/2026-10-08.md`:

```markdown
## ABC-123 — Fix lỗi đăng nhập SSO
- Phiên: 09:05–10:40 (1h35m) [worklog 10234] · 13:30–15:00 (1h30m)
- Trạng thái: done
- Đã làm:
  - ✓ Tìm nguyên nhân: token SSO hết hạn không được refresh
  - Sửa AuthService, thêm test hồi quy
- Vướng mắc: chờ KH cấp tài khoản test SSO
- Jira worklog: chờ xác nhận
```

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

### Confluence — 14 tool (khi có `CONFLUENCE_BASE_URL`)

| Nhóm | Tool |
|---|---|
| Trang | `confluence_search` · `confluence_get_page` · `confluence_get_page_children` · `confluence_list_spaces` · `confluence_create_page` ✎ · `confluence_update_page` ✎ |
| Comment | `confluence_get_comments` · `confluence_add_comment` ✎ |
| Label | `confluence_get_labels` · `confluence_add_labels` ✎ |
| Attachment | `confluence_list_attachments` · `confluence_download_attachment` · `confluence_upload_attachment` ✎ |
| Daily | `confluence_fill_daily` ✎ |

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
Làm task ABC-123.            # skill logwork mở phiên, ghi giờ bắt đầu
Xong task rồi, log work đi.  # đề xuất worklog, chờ bạn đồng ý
Điền daily.                  # xem trước ô daily ngày mai, chờ xác nhận rồi ghi
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
- **Daily meeting:** chỉ điền vào bảng có sẵn hàng của bạn và cột ngày. Bảng có ô gộp (`rowspan`/`colspan` ở tiêu đề ngày) hoặc ngày trùng lặp thì tool dừng và bảo điền thủ công; tool không tự thêm hàng/cột.
- **Ngày làm việc kế tiếp** chỉ bỏ thứ 7/chủ nhật, không tính ngày lễ — kiểm tra ngày trong bản xem trước.
- **Skill logwork** chạy trên Linux và macOS; chưa hỗ trợ Windows (cmd). Logwork chỉ gom trong repo hiện tại.

## Phát triển

```bash
npm ci
npm test                 # unit + tool tests (mock HTTP, không gọi server thật)
npm run build            # biên dịch ra dist/
cp .env.example .env     # điền thông tin đăng nhập để chạy smoke test
npm run smoke            # chỉ gọi tool đọc trên Jira (và Confluence nếu có CONFLUENCE_BASE_URL)
npx @modelcontextprotocol/inspector node dist/index.js   # thử tool bằng giao diện web
npm run release-check    # build lại dist/ + test; báo lỗi nếu dist/ chưa commit
claude plugin validate . # kiểm tra manifest plugin
```

> `dist/` **được commit** vì plugin cài từ git không chạy bước build. Trước khi push, luôn chạy `npm run release-check` và commit `dist/` nếu có thay đổi.

**Cấu trúc mã nguồn**

```text
.claude-plugin/
├── plugin.json         # manifest plugin gem-jira: userConfig + MCP server
└── marketplace.json    # marketplace gem-tools
skills/logwork/SKILL.md # skill logwork & daily
dist/                   # bản build (commit cùng source)
src/
├── index.ts            # entry point stdio: config → kiểm tra đăng nhập → server
├── server.ts           # startup checks, đăng ký nhóm tool
├── config.ts           # đọc và validate biến môi trường
├── http/               # HttpClient (Basic Auth, retry GET, timeout) và HttpError
├── jira/               # client, format kết quả, cache field
├── confluence/         # Markdown ↔ storage, format kết quả, xử lý ô daily
└── tools/              # định nghĩa tool MCP theo nhóm (jira_*, confluence/*)
```

Công nghệ: TypeScript (ESM), `@modelcontextprotocol/sdk`, `zod`, `marked`, `turndown`; kiểm thử bằng `vitest` + `msw`.

## Tài liệu liên quan

| Tài liệu | Nội dung |
|---|---|
| [docs/integration.md](docs/integration.md) | Cài đặt cho từng client, prompt mẫu, xử lý sự cố |
| [docs/tools.md](docs/tools.md) | Tham số và ví dụ chi tiết của từng tool |
| [docs/superpowers/specs/](docs/superpowers/specs/) | Thiết kế (design spec) |
