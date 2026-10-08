# Hướng dẫn tích hợp jira-server-mcp

Tài liệu này hướng dẫn kết nối `jira-server-mcp` với các MCP client phổ biến: Claude Code, Claude Desktop, VS Code và Cursor. Mỗi người dùng chạy server trên máy mình, bằng tài khoản Jira của chính mình.

- [1. Yêu cầu](#1-yêu-cầu)
- [2. Chọn cách chạy server](#2-chọn-cách-chạy-server)
- [3. Claude Code](#3-claude-code)
- [4. Claude Desktop](#4-claude-desktop)
- [5. VS Code (GitHub Copilot agent mode)](#5-vs-code-github-copilot-agent-mode)
- [6. Cursor](#6-cursor)
- [7. Kiểm tra nhanh bằng MCP Inspector](#7-kiểm-tra-nhanh-bằng-mcp-inspector)
- [8. Chế độ chỉ đọc](#8-chế-độ-chỉ-đọc)
- [9. Ví dụ câu lệnh cho Claude](#9-ví-dụ-câu-lệnh-cho-claude)
- [10. Xử lý sự cố](#10-xử-lý-sự-cố)
- [11. Bảo mật](#11-bảo-mật)
- [12. Cập nhật phiên bản](#12-cập-nhật-phiên-bản)

## 1. Yêu cầu

| | |
|---|---|
| Node.js | ≥ 20 (`node --version`) |
| Jira | Jira Server/Data Center 8.x, đăng nhập bằng username/password. Đã kiểm tra với 8.5.19 tại `https://pm.gem-corp.tech` |
| Mạng | Máy chạy MCP truy cập được `JIRA_BASE_URL` (VPN nếu cần) |
| Git | Cần nếu cài qua `npx` từ git URL |

Trước khi bắt đầu, hãy đăng nhập Jira trên trình duyệt một lần để chắc chắn tài khoản không bị khoá hoặc đang bị yêu cầu CAPTCHA.

## 2. Chọn cách chạy server

Mọi client đều chạy server bằng một lệnh. Chọn một trong hai cách dưới đây; các ví dụ ở phần sau dùng **cách A**. Với cách B, thay `npx -y git+https://…` bằng `node /đường/dẫn/jira-mcp/dist/index.js`.

**Cách A — `npx` từ git (không cần clone)**

```
command: npx
args:    -y git+https://<git-nội-bộ>/jira-mcp.git
```

Lần chạy đầu, npm tải mã nguồn và tự build (mất khoảng 30–60 giây). Các lần sau dùng bản đã cache. Muốn ghim một phiên bản, thêm `#<tag>` hoặc `#<commit>` vào cuối URL.

**Cách B — clone và build**

```bash
git clone https://<git-nội-bộ>/jira-mcp.git ~/tools/jira-mcp
cd ~/tools/jira-mcp && npm ci && npm run build
```

```
command: node
args:    /home/<bạn>/tools/jira-mcp/dist/index.js
```

Cách B khởi động nhanh hơn và không phụ thuộc mạng git khi chạy. Nên dùng nếu `npx` bị timeout ở client.

**Biến môi trường**

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `JIRA_BASE_URL` | ✓ | | `https://pm.gem-corp.tech` |
| `JIRA_USERNAME` | ✓ | | username Jira (không phải email) |
| `JIRA_PASSWORD` | ✓ | | mật khẩu Jira |
| `JIRA_READ_ONLY` | | `false` | `true` → chỉ bật tool đọc |
| `JIRA_INSECURE_TLS` | | `false` | `true` → bỏ kiểm tra chứng chỉ TLS |
| `JIRA_TIMEOUT_MS` | | `30000` | timeout mỗi request |

## 3. Claude Code

### 3.1 Thêm bằng lệnh (cách nhanh nhất)

```bash
claude mcp add jira --scope user \
  -e JIRA_BASE_URL=https://pm.gem-corp.tech \
  -e JIRA_USERNAME=<username> \
  -e JIRA_PASSWORD='<password>' \
  -- npx -y git+https://<git-nội-bộ>/jira-mcp.git
```

- Luôn đặt `--` trước lệnh chạy server. `-e` nhận nhiều giá trị, nên thiếu `--` thì lệnh sẽ bị hiểu nhầm là biến môi trường.
- Bọc mật khẩu trong dấu nháy đơn nếu có ký tự đặc biệt (`@`, `$`, `!`…).
- `--scope`:
  - `local` (mặc định): chỉ bạn, chỉ trong project hiện tại.
  - `user`: chỉ bạn, mọi project. **Nên dùng.**
  - `project`: ghi vào `.mcp.json` để chia sẻ qua git. Xem 3.2, và **không** dùng `-e JIRA_PASSWORD=…` với scope này.

Kiểm tra:

```bash
claude mcp list          # jira phải ở trạng thái ✓ Connected
claude mcp get jira
```

Trong phiên Claude Code, gõ `/mcp` để xem trạng thái và danh sách tool. Muốn gỡ: `claude mcp remove jira --scope user`.

### 3.2 Chia sẻ cấu hình cho cả team qua `.mcp.json`

Commit file `.mcp.json` ở gốc repo, **không có mật khẩu**, và đọc thông tin đăng nhập từ biến môi trường của từng người (Claude Code tự thay `${VAR}`):

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "git+https://<git-nội-bộ>/jira-mcp.git"],
      "env": {
        "JIRA_BASE_URL": "https://pm.gem-corp.tech",
        "JIRA_USERNAME": "${JIRA_USERNAME}",
        "JIRA_PASSWORD": "${JIRA_PASSWORD}",
        "JIRA_READ_ONLY": "${JIRA_READ_ONLY:-false}"
      }
    }
  }
}
```

Mỗi người tự đặt biến trong shell profile (`~/.bashrc`, `~/.zshrc`) hoặc dùng trình quản lý secret:

```bash
export JIRA_USERNAME=<username>
export JIRA_PASSWORD='<password>'
```

Lần đầu mở project, Claude Code sẽ hỏi có tin tưởng server trong `.mcp.json` không. Chọn đồng ý.

### 3.3 Sửa file cấu hình trực tiếp

Scope `user` và `local` được lưu trong `~/.claude.json`. Có thể sửa tay theo cấu trúc `mcpServers` như trên, rồi khởi động lại Claude Code.

## 4. Claude Desktop

Mở **Settings → Developer → Edit Config**, hoặc mở trực tiếp file:

| Hệ điều hành | Đường dẫn |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

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

Thoát hẳn Claude Desktop rồi mở lại. Biểu tượng công cụ trong ô chat sẽ liệt kê các tool `jira_*`.

Lưu ý:
- Claude Desktop **không** thay `${VAR}`, nên mật khẩu phải ghi trực tiếp trong file. Hãy giữ file này ở chế độ chỉ mình bạn đọc được.
- Trên Windows, nếu báo không tìm thấy `npx`, dùng `"command": "npx.cmd"` hoặc đường dẫn đầy đủ tới `node.exe` (cách B).
- Log của server nằm trong thư mục log của Claude Desktop (`~/Library/Logs/Claude/mcp-server-jira.log` trên macOS, `%APPDATA%\Claude\logs\` trên Windows).

## 5. VS Code (GitHub Copilot agent mode)

Tạo `.vscode/mcp.json` trong workspace (hoặc chạy lệnh **MCP: Open User Configuration** để cấu hình cho mọi workspace). VS Code hỗ trợ hỏi mật khẩu lúc chạy và lưu nó an toàn, nên file này commit được:

```json
{
  "inputs": [
    { "type": "promptString", "id": "jira-username", "description": "Jira username" },
    { "type": "promptString", "id": "jira-password", "description": "Jira password", "password": true }
  ],
  "servers": {
    "jira": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "git+https://<git-nội-bộ>/jira-mcp.git"],
      "env": {
        "JIRA_BASE_URL": "https://pm.gem-corp.tech",
        "JIRA_USERNAME": "${input:jira-username}",
        "JIRA_PASSWORD": "${input:jira-password}"
      }
    }
  }
}
```

Bấm **Start** phía trên khai báo server trong file, nhập username và mật khẩu khi được hỏi, rồi mở Copilot Chat ở chế độ **Agent** để dùng tool.

## 6. Cursor

Tạo `~/.cursor/mcp.json` (cho mọi project) hoặc `.cursor/mcp.json` (cho một project):

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

Vào **Settings → MCP** để kiểm tra server có chấm xanh. **Không commit** `.cursor/mcp.json` khi trong đó có mật khẩu.

## 7. Kiểm tra nhanh bằng MCP Inspector

Dùng để thử từng tool mà không cần client AI:

```bash
JIRA_BASE_URL=https://pm.gem-corp.tech JIRA_USERNAME=<u> JIRA_PASSWORD='<p>' \
  npx @modelcontextprotocol/inspector npx -y git+https://<git-nội-bộ>/jira-mcp.git
```

Inspector mở trên trình duyệt. Vào tab **Tools**, chọn `jira_search` và nhập `{"jql": "assignee = currentUser()"}`.

Nếu đã clone repo (cách B), còn có thể chạy smoke test. Lệnh này chỉ gọi tool đọc:

```bash
cp .env.example .env   # điền thông tin
npm run build && npm run smoke
```

Kết quả mong đợi:

```
[jira-mcp] connected as <username>, agile tools: on, read-only: off
OK   listTools: 26 tools
OK   jira_search: …
OK   jira_get_issue …
OK   jira_list_boards: …
```

## 8. Chế độ chỉ đọc

Đặt `JIRA_READ_ONLY=true` để server chỉ đăng ký 14 tool đọc: không tạo, sửa, comment, chuyển trạng thái, log work hay động vào sprint. Nên dùng khi:

- mới làm quen, muốn Claude chỉ tra cứu và tóm tắt;
- chạy trong môi trường tự động hoặc CI;
- dùng chung cấu hình cho người chỉ cần đọc.

`jira_download_attachment` vẫn có trong chế độ này, vì nó chỉ đọc từ Jira dù có ghi file ra máy bạn.

## 9. Ví dụ câu lệnh cho Claude

Không cần gọi tên tool. Claude tự chọn tool dựa trên yêu cầu:

- "Liệt kê các issue đang assign cho tôi trong project TDISGSAI, sắp xếp theo ngày cập nhật."
- "Tóm tắt TDISGSAI-145: mô tả, trạng thái, các comment gần nhất."
- "Sprint đang chạy của board TDISGSAI còn những issue nào chưa Done?"
- "Tạo Task trong TDISGSAI: 'Chuẩn hoá dữ liệu train', assign cho tôi, label `data`."
- "Chuyển TDISGSAI-145 sang In Progress và comment 'Bắt đầu làm'."
- "Log 2h30m vào TDISGSAI-145 cho sáng nay lúc 9h, ghi chú 'review dataset'."
- "Ai đã đổi trạng thái TDISGSAI-145 và lúc nào?" (Claude dùng `expand: changelog`)
- "Story Points của project này là field nào?" (Claude dùng `jira_search_fields`)

Mẹo:
- Description và comment dùng **wiki markup** của Jira (`*đậm*`, `_nghiêng_`, `{code}…{code}`, `[link|https://…]`), không phải Markdown. Có thể yêu cầu Claude viết theo định dạng này.
- Custom field truyền qua `customFields` theo id (ví dụ `customfield_10006` cho Story Points). Claude tự tra id bằng `jira_search_fields` hoặc `jira_get_create_meta`.
- Với issue type có field bắt buộc riêng (ví dụ Bug của TDISGSAI), hãy nhờ Claude chạy `jira_get_create_meta` trước khi tạo.

## 10. Xử lý sự cố

Server ghi log ra stderr với tiền tố `[jira-mcp]`. Xem bằng `claude --debug`, trong log của Claude Desktop, hoặc ở tab Output → MCP của VS Code.

| Thông báo / triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Cấu hình không hợp lệ: - JIRA_… is required` | Thiếu biến môi trường, hoặc `${VAR}` chưa được đặt | Kiểm tra khối `env`. Với `.mcp.json`, chắc chắn đã `export` biến trước khi mở Claude Code |
| `Xác thực thất bại: sai username/password.` | Sai thông tin đăng nhập, hoặc dùng email thay cho username | Kiểm tra lại. Lưu ý: **đừng thử lại liên tục**, vì Jira sẽ bật CAPTCHA |
| `Tài khoản đang bị yêu cầu CAPTCHA…` | Đăng nhập sai quá nhiều lần | Đăng nhập Jira trên trình duyệt một lần (nhập CAPTCHA), rồi khởi động lại MCP |
| `Jira trả về nội dung không phải JSON (HTTP 200, text/html)…` | Bị chuyển sang trang login/SSO, hoặc proxy trả trang lỗi | Kiểm tra VPN/proxy. Mở `JIRA_BASE_URL/rest/api/2/serverInfo` trên trình duyệt xem có ra JSON không |
| `Lỗi kết nối tới Jira: fetch failed (ENOTFOUND …)` | Không phân giải được tên miền | Kiểm tra VPN/DNS và `JIRA_BASE_URL` |
| `… (SELF_SIGNED_CERT_IN_CHAIN …)` hoặc `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | Jira dùng chứng chỉ của CA nội bộ | Nên dùng `NODE_EXTRA_CA_CERTS=/path/ca.pem`. Tạm thời có thể đặt `JIRA_INSECURE_TLS=true` |
| `Jira không phản hồi trong thời gian cho phép` | Jira chậm, hoặc JQL quá nặng | Thu hẹp JQL, giảm `maxResults`, hoặc tăng `JIRA_TIMEOUT_MS` |
| Không thấy tool `jira_list_boards` / sprint | Server không có Jira Software, hoặc tài khoản không xem được board | Log sẽ có `agile tools: off`. Kiểm tra `/rest/agile/1.0/board` trên trình duyệt |
| Không thấy tool tạo/sửa | Đang bật `JIRA_READ_ONLY=true` | Bỏ biến này hoặc đặt `false` |
| Client báo timeout khi khởi động lần đầu | `npx` đang tải và build | Chạy lệnh `npx -y git+…` một lần ở terminal cho cache sẵn, hoặc dùng cách B |
| `Không tìm thấy GET /rest/api/2/issue/X hoặc không có quyền xem.` | Sai issue key, hoặc không có quyền với project | Kiểm tra quyền trên giao diện web |
| `Yêu cầu không hợp lệ (400): - customfield_…: …` | Thiếu field bắt buộc, hoặc sai kiểu giá trị | Nhờ Claude chạy `jira_get_create_meta` để xem field bắt buộc và giá trị hợp lệ |

## 11. Bảo mật

- Mật khẩu là thông tin đăng nhập đầy đủ vào Jira. MCP thao tác với **đúng quyền của tài khoản bạn**.
- **Không commit** file chứa mật khẩu: `.env`, `~/.claude.json`, `.cursor/mcp.json`, `claude_desktop_config.json`. Khi chia sẻ qua git, dùng `${VAR}` (Claude Code) hoặc `inputs` (VS Code).
- Giữ file cấu hình ở chế độ chỉ mình bạn đọc được (`chmod 600`).
- Server không bao giờ log mật khẩu, không tự thử lại khi sai mật khẩu, và không gửi thông tin đăng nhập tới host khác `JIRA_BASE_URL`.
- Khi đổi mật khẩu Jira, nhớ cập nhật mọi nơi đã cấu hình.
- MCP không có tool xoá (issue, comment, worklog, attachment, sprint). Các thao tác không hoàn tác được hãy làm trên web.
- Claude Code mặc định hỏi trước mỗi lần gọi tool. Chỉ nên cho phép tự động các tool đọc.

## 12. Cập nhật phiên bản

- **Cách A (`npx`)**: npx cache theo URL. Để lấy bản mới, ghim tag mới trong URL (`…jira-mcp.git#v0.2.0`), hoặc xoá cache bằng `rm -rf ~/.npm/_npx` rồi khởi động lại client.
- **Cách B (clone)**: `git pull && npm ci && npm run build`, rồi khởi động lại client.
