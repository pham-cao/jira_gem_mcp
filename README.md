# jira-server-mcp

MCP server (stdio) cho **Jira Server 8.x** đăng nhập bằng username/password (Basic Auth). Cho phép Claude Code hoặc MCP client khác tìm kiếm, đọc và thao tác issue, comment, worklog, link, attachment, board và sprint bằng tài khoản Jira của chính bạn.

Đã kiểm tra với Jira Server 8.5.19 (`https://pm.gem-corp.tech`).

## Yêu cầu

- Node.js ≥ 20
- Tài khoản Jira Server/Data Center đăng nhập được bằng username/password

## Cài đặt

> Hướng dẫn chi tiết cho Claude Code, Claude Desktop, VS Code, Cursor, kèm ví dụ prompt và bảng xử lý sự cố: **[docs/integration.md](docs/integration.md)**.

### Cách A — chạy qua `npx` từ git

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

### Cách B — clone và build

```bash
git clone https://github.com/pham-cao/jira_gem_mcp.git
cd jira_gem_mcp && npm ci && npm run build
```

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/đường/dẫn/jira_gem_mcp/dist/index.js"],
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

Hoặc dùng lệnh: `claude mcp add jira -e JIRA_BASE_URL=https://pm.gem-corp.tech -e JIRA_USERNAME=<u> -e JIRA_PASSWORD=<p> -e CONFLUENCE_BASE_URL=https://conf.gem-corp.tech -- node /đường/dẫn/jira_gem_mcp/dist/index.js`

## Cấu hình

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `JIRA_BASE_URL` | ✓ | | URL Jira, vd `https://pm.gem-corp.tech` |
| `JIRA_USERNAME` | ✓ | | username Jira |
| `JIRA_PASSWORD` | ✓ | | mật khẩu Jira |
| `JIRA_READ_ONLY` | | `false` | `true` → chỉ bật các tool đọc |
| `JIRA_INSECURE_TLS` | | `false` | `true` → bỏ kiểm tra chứng chỉ TLS (chỉ dùng với CA nội bộ) |
| `JIRA_TIMEOUT_MS` | | `30000` | timeout mỗi request |
| `CONFLUENCE_BASE_URL` | | | URL Confluence, vd `https://conf.gem-corp.tech`. Không đặt thì Confluence tắt hoàn toàn (không có tool `confluence_*`) |
| `CONFLUENCE_USERNAME` | | `JIRA_USERNAME` | username Confluence, chỉ cần khi khác tài khoản Jira (yêu cầu có `CONFLUENCE_BASE_URL`) |
| `CONFLUENCE_PASSWORD` | | `JIRA_PASSWORD` | mật khẩu Confluence, chỉ cần khi khác tài khoản Jira (yêu cầu có `CONFLUENCE_BASE_URL`) |

Khi khởi động, server gọi `/rest/api/2/myself` để kiểm tra đăng nhập (sai thì thoát ngay với thông báo lỗi), và chỉ bật tool agile nếu Jira có Jira Software. Nếu có `CONFLUENCE_BASE_URL`, server kiểm tra thêm đăng nhập Confluence theo cách tương tự (sai thì cũng thoát ngay).

## ⚠️ Bảo mật

- Mật khẩu nằm dạng plain text trong file cấu hình MCP. **Không commit** `.mcp.json`, `~/.claude.json` hay `.env` chứa mật khẩu lên git.
- Nhập sai mật khẩu nhiều lần, Jira sẽ yêu cầu CAPTCHA và mọi request API đều bị từ chối. Khi đó hãy đăng nhập Jira trên trình duyệt một lần để mở khoá.
- Server không retry khi lỗi xác thực, và không gửi thông tin đăng nhập tới host khác `JIRA_BASE_URL`.
- `jira_download_attachment` (ghi file) và `jira_upload_attachment` (đọc file) nhận **đường dẫn local bất kỳ**, không giới hạn thư mục. Nội dung Jira (description, comment do người khác viết) có thể chứa prompt injection, dụ model ghi đè file nhạy cảm (vd `~/.bashrc`) hoặc upload file bí mật (vd `~/.ssh/id_rsa`) lên issue. **Luôn đọc kỹ tham số đường dẫn trước khi duyệt hai tool này**, không đưa chúng vào danh sách tự động cho phép.
- `confluence_download_attachment` (ghi file) và `confluence_upload_attachment` (đọc file) có cùng rủi ro: nhận **đường dẫn local bất kỳ**, và nội dung trang/comment Confluence do người khác viết có thể chứa prompt injection. Luôn đọc kỹ tham số đường dẫn trước khi duyệt, không đưa hai tool này vào danh sách tự động cho phép.
- `jira_download_attachment` và `confluence_download_attachment` vẫn bật khi `JIRA_READ_ONLY=true`, vì chúng chỉ đọc từ Jira/Confluence dù có ghi file trên máy.
- `JIRA_INSECURE_TLS=true` tắt kiểm tra chứng chỉ TLS cho cả tiến trình, nên dễ bị tấn công MITM. Nên ưu tiên `NODE_EXTRA_CA_CERTS=/đường/dẫn/ca.pem` để tin CA nội bộ.

## Danh sách tool

> Mô tả chi tiết tham số, kết quả và ví dụ của từng tool: **[docs/tools.md](docs/tools.md)**.

**Đọc:** `jira_search` (JQL), `jira_get_issue`, `jira_get_comments`, `jira_get_worklogs`, `jira_get_transitions`, `jira_list_projects`, `jira_get_create_meta`, `jira_search_fields`, `jira_search_users`, `jira_list_link_types`, `jira_download_attachment`

**Ghi** (tắt khi `JIRA_READ_ONLY=true`): `jira_create_issue`, `jira_update_issue`, `jira_assign_issue`, `jira_transition_issue`, `jira_add_comment`, `jira_update_comment`, `jira_add_worklog`, `jira_link_issues`, `jira_upload_attachment`

**Agile** (chỉ khi có Jira Software): `jira_list_boards`, `jira_list_sprints`, `jira_get_sprint_issues`, `jira_move_issues_to_sprint`*, `jira_create_sprint`*, `jira_update_sprint`* (* = ghi)

Lưu ý Jira Server: user định danh bằng `name` (username); description/comment dùng wiki markup (`*đậm*`, `{code}…{code}`); custom field truyền qua `customFields` theo id (tra bằng `jira_search_fields`).

**Confluence** (chỉ khi có `CONFLUENCE_BASE_URL`; mặc định body trang là Markdown, tự chuyển qua lại với storage XHTML):

- **Đọc:** `confluence_search` (CQL), `confluence_get_page`, `confluence_get_page_children`, `confluence_list_spaces`, `confluence_get_comments`, `confluence_get_labels`, `confluence_list_attachments`, `confluence_download_attachment`
- **Ghi** (tắt khi `JIRA_READ_ONLY=true`): `confluence_create_page`, `confluence_update_page`, `confluence_add_comment`, `confluence_add_labels`, `confluence_upload_attachment`

Không hỗ trợ xoá (issue, comment, worklog, attachment, sprint, trang Confluence) — hãy làm trên giao diện web.

## Phát triển

```bash
npm test                 # unit + tool tests (mock HTTP, không gọi Jira thật)
npm run build
cp .env.example .env     # điền thông tin đăng nhập
npm run smoke            # chỉ gọi tool đọc trên Jira thật (và Confluence nếu .env có CONFLUENCE_BASE_URL)
npx @modelcontextprotocol/inspector node dist/index.js   # thử tool bằng giao diện
```
