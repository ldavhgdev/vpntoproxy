# Proxy Manager - Ubuntu Node.js Implementation
## Files Manifest

Dữ liệu các file được tạo ra cho phiên bản Node.js chạy trên Ubuntu VPS.

---

## 📦 Cấu Trúc File

```
VPNtoProxy/
│
├── ubuntu-nodejs-setup.sh          ← Setup script chính
├── nodejs-app.js                   ← Main application
├── nodejs-web-ui.html              ← Web UI (copy vào web/)
├── .env.example-ubuntu             ← .env template
│
├── ubuntu-nodejs-README.md         ← Hướng dẫn chi tiết
├── QUICK_START_UBUNTU.md           ← Quick start (5 phút)
└── UBUNTU_NODEJS_FILES_MANIFEST.md ← File này
```

---

## 📋 Chi Tiết Từng File

### 1. `ubuntu-nodejs-setup.sh`

**Loại**: Bash setup script  
**Kích thước**: ~5-6 KB  
**Mục đích**: Cài đặt toàn bộ hệ thống trên Ubuntu VPS

**Chức năng**:
- Cập nhật hệ thống (apt-get update/upgrade)
- Cài đặt các gói cần thiết (curl, wget, jq, git, build-essential, etc)
- Cài đặt Node.js 20.x từ NodeSource
- Tải wireproxy binary (tự động chọn architecture)
- Tạo thư mục cần thiết (configs, logs, runtime, data, etc)
- Tạo package.json với dependencies
- Tạo .env file
- Tạo systemd service file
- Cấu hình UFW firewall (nếu có)

**Sử dụng**:
```bash
chmod +x ubuntu-nodejs-setup.sh
sudo ./ubuntu-nodejs-setup.sh
```

**Yêu cầu**:
- Ubuntu 18.04+
- Quyền root/sudo
- Kết nối internet

---

### 2. `nodejs-app.js`

**Loại**: Node.js application  
**Kích thước**: ~15-20 KB  
**Mục đích**: Main application - quản lý tunnels và proxies

**Cấu trúc**:

```javascript
// ============================================================================
// CONFIGURATION (from .env)
// ============================================================================
- config.baseDir, configDir, runtimeDir, logDir, binDir, stateFile
- config.host, port, password
- config.socksBase, httpBase
- config.healthInterval, failThreshold, checkUrl, keepalive

// ============================================================================
// LOGGER
// ============================================================================
class Logger
- log(level, msg) - Ghi log vào file + console
- info(), warn(), error(), debug()

// ============================================================================
// UTILITIES
// ============================================================================
- safeName(name) - Normalize config file names
- parseWireGuardConfig(text) - Parse WireGuard .conf format
- validateWireGuardConfig(text) - Validate WireGuard config
- hashSHA256(data) - Hash for config fingerprinting
- portAvailable(host, port) - Check if port is free
- buildRuntimeWireGuardConfig(text, endpoint, keepalive) - Build runtime config
- getLanIP() - Get local network IP

// ============================================================================
// TUNNEL RUNTIME
// ============================================================================
class TunnelRuntime
- Properties: proc, status, error, ip, country, latency, etc
- Methods: isRunning()

// ============================================================================
// MANAGER
// ============================================================================
class ProxyManager extends EventEmitter
- CRUD operations: create(), update(), delete()
- Tunnel control: start(), stop(), restart(), rotate()
- Config management: listConfigs(), addConfig(), deleteConfig()
- Health checks & supervision
- Export in multiple formats

// ============================================================================
// HTTP API SERVER
// ============================================================================
async function handleRequest(req, res)
- GET endpoints: /api/state, /api/export, /api/confs/{name}
- POST endpoints: /api/tunnels, /api/confs/upload, /api/settings, etc
- Authentication via Basic auth

// ============================================================================
// SUPERVISION LOOP
// ============================================================================
async function supervisionLoop()
- Monitor process health
- Auto-restart on failure
- Schedule IP rotation
- Run every 2 seconds

// ============================================================================
// MAIN
// ============================================================================
async function main()
- Initialize logger
- Load saved state
- Start supervision
- Start HTTP server
- Handle signals (SIGINT, SIGTERM)
```

**API Endpoints**:

```
GET  /                           - Serve index.html
GET  /api/state                  - Get all tunnels state
GET  /api/export                 - Export proxy list
GET  /api/confs/{name}           - Get config content

POST /api/tunnels                - Create tunnel
POST /api/tunnels/{id}/start     - Start tunnel
POST /api/tunnels/{id}/stop      - Stop tunnel
POST /api/tunnels/{id}/restart   - Restart tunnel
POST /api/tunnels/{id}/rotate    - Rotate IP
POST /api/tunnels/{id}/update    - Update tunnel config
POST /api/tunnels/{id}/delete    - Delete tunnel
POST /api/tunnels/bulk_create    - Create multiple tunnels
POST /api/bulk                   - Bulk operations (start/stop/delete)
POST /api/confs/upload           - Upload .conf files
POST /api/confs/delete           - Delete .conf file
POST /api/settings               - Update settings
```

**Sử dụng**:
```bash
node app.js              # Start application
node app.js --dev        # Development mode
node app.js --daemon     # Background mode
```

---

### 3. `nodejs-web-ui.html`

**Loại**: HTML/CSS/JavaScript  
**Kích thước**: ~25-30 KB  
**Mục đích**: Web UI dashboard

**Tính năng**:
- Hiển thị danh sách tunnels
- Quản lý tunnel (tạo, sửa, xóa)
- Kiểm soát tunnel (bật, tắt, xoay IP)
- Tải file WireGuard config
- Xuất proxy list
- Xem logs tunnel
- Cài đặt toàn cầu
- Dark/Light mode (auto)
- Responsive design

**Sections**:
- **Tunnels tab**: Danh sách tunnel và điều khiển
- **Configs tab**: Quản lý .conf files
- **Dialogs**: Nạp file, tạo/sửa tunnel, xuất, cài đặt, xem logs

**Styling**:
- Barlow & Barlow Semi Condensed fonts
- CSS variables for theming
- Dark mode via prefers-color-scheme
- Grid layout (responsive)

---

### 4. `.env.example-ubuntu`

**Loại**: Configuration template  
**Kích thước**: ~2 KB  
**Mục đích**: Template file cho .env

**Biến chính**:
```env
NODE_ENV=production
APP_HOST=127.0.0.1
APP_PORT=8686
SOCKS_BASE_PORT=20001
HTTP_BASE_PORT=30001
HEALTH_CHECK_INTERVAL=30
FAIL_THRESHOLD=3
KEEPALIVE=25
CONFIG_DIR=/opt/proxy-manager/configs
RUNTIME_DIR=/opt/proxy-manager/runtime
LOG_DIR=/opt/proxy-manager/logs
```

**Sử dụng**:
```bash
cp .env.example-ubuntu .env
nano .env  # Sửa theo cần
```

---

### 5. `ubuntu-nodejs-README.md`

**Loại**: Documentation (Markdown)  
**Kích thước**: ~15 KB  
**Mục đích**: Hướng dẫn chi tiết đầy đủ

**Nội dung**:
- Tính năng
- Yêu cầu
- Cài đặt nhanh
- Cấu hình WireGuard
- Tạo tunnel
- Sử dụng proxy (Python, Node.js, cURL)
- Quản lý (systemd, file paths, cài đặt)
- Khắc phục sự cố
- Cấu hình nâng cao
- API endpoints
- Ví dụ sử dụng
- Bảo mật
- Backup/Restore
- Gỡ cài đặt

---

### 6. `QUICK_START_UBUNTU.md`

**Loại**: Quick start guide  
**Kích thương**: ~8 KB  
**Mục đích**: Hướng dẫn nhanh 5 phút

**Nội dung**:
1. Chuẩn bị
2. Tải setup script
3. Chạy setup
4. Cấu hình app
5. Khởi động
6. Truy cập Web UI
7. Nạp WireGuard config
8. Tạo tunnel
9. Sử dụng proxy
10. Kiểm tra hoạt động

**Mục đích**: Giúp user nhanh chóng có hệ thống chạy

---

## 🚀 Installation Workflow

```
┌─────────────────────────────────────────┐
│ 1. SSH vào Ubuntu VPS                   │
└─────────────────────────────┬───────────┘
                              ↓
┌─────────────────────────────────────────┐
│ 2. Download ubuntu-nodejs-setup.sh      │
└─────────────────────────────┬───────────┘
                              ↓
┌─────────────────────────────────────────┐
│ 3. sudo bash ubuntu-nodejs-setup.sh     │
│    (tự động cài đặt mọi thứ)            │
└─────────────────────────────┬───────────┘
                              ↓
┌─────────────────────────────────────────┐
│ 4. Copy nodejs-app.js + web UI          │
│    (hoặc setup script sẽ tạo sẵn)       │
└─────────────────────────────┬───────────┘
                              ↓
┌─────────────────────────────────────────┐
│ 5. sudo systemctl start proxy-manager   │
└─────────────────────────────┬───────────┘
                              ↓
┌─────────────────────────────────────────┐
│ 6. Mở http://VPS_IP:8686                │
│    → Nạp file WireGuard config          │
│    → Tạo tunnels                        │
│    → Sử dụng proxies                    │
└─────────────────────────────────────────┘
```

---

## 📁 After Installation

Thư mục sau khi setup hoàn tất:

```
/opt/proxy-manager/
├── app.js                           # Main app
├── package.json                     # Dependencies
├── .env                             # Config
├── web/
│   └── index.html                   # Web UI
├── bin/
│   └── wireproxy                    # WireGuard proxy binary
├── configs/
│   ├── us-west-1.conf               # WireGuard configs
│   ├── eu-london.conf
│   └── ...
├── runtime/
│   ├── <tunnel_id>.wg.conf          # Runtime WG config
│   ├── <tunnel_id>.wireproxy.conf   # Runtime wireproxy config
│   └── ...
├── logs/
│   ├── app.log                      # Application log
│   ├── <tunnel_id>.log              # Tunnel logs
│   └── ...
├── data/
│   └── state.json                   # Saved state (tunnels)
└── node_modules/                    # npm dependencies
```

---

## 🔧 Comparison: Python vs Node.js

| Aspek | Python Version | Node.js Version |
|-------|---|---|
| **Platform** | Windows Desktop | Ubuntu VPS |
| **Language** | Python 3.9+ | Node.js 14+ |
| **Binary** | wireproxy.exe | wireproxy (Linux) |
| **UI** | Electron-like | Web UI (HTML/JS) |
| **Database** | JSON state file | JSON state file |
| **Architecture** | Single process | Single HTTP server |
| **Dependency** | Python stdlib | npm packages |
| **Startup** | pythonw app.py | node app.js |
| **Service** | Windows Task Scheduler | systemd |
| **API** | HTTP REST | HTTP REST |
| **Config Format** | Same .conf files | Same .conf files |

**Tương đồng**: 
- Cùng cấu hình file
- Cùng API endpoints
- Cùng Web UI logic
- Tương thích hoàn toàn

---

## 📊 File Sizes

```
ubuntu-nodejs-setup.sh      ~6 KB   (bash script)
nodejs-app.js              ~18 KB   (Node.js app)
nodejs-web-ui.html         ~28 KB   (HTML/CSS/JS)
.env.example-ubuntu         ~2 KB   (config template)

Total: ~54 KB (không tính node_modules & wireproxy)

node_modules/              ~200 MB  (được cài tự động)
wireproxy binary           ~20-40 MB (được tải tự động)
```

---

## 🎯 Key Features Implemented

✅ Multi-tunnel management  
✅ WireGuard config parsing & validation  
✅ SOCKS5 & HTTP proxy support  
✅ Auto health checks & restart  
✅ IP rotation scheduling  
✅ Web UI dashboard  
✅ Config upload/management  
✅ Proxy export (multiple formats)  
✅ Logging & monitoring  
✅ Systemd integration  
✅ Firewall auto-config (UFW)  
✅ Basic authentication  

---

## 🔐 Security Notes

- Web UI authentication via Basic Auth
- WireGuard private keys masked in UI
- Systemd service runs as root (required for network)
- .env file should have 600 permissions
- Firewall rules auto-configured
- No secrets in logs

---

## 📞 Support Files

Untuk membantu user:
1. **QUICK_START_UBUNTU.md** - Mulai cepat
2. **ubuntu-nodejs-README.md** - Referensi lengkap
3. **app.js comments** - Dokumentasi inline code
4. **Logs** - `/opt/proxy-manager/logs/app.log`

---

## 🔄 Updates & Maintenance

```bash
# Update wireproxy
cd /opt/proxy-manager/bin
curl -fsSL https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_linux_amd64.tar.gz | tar xz wireproxy
chmod +x wireproxy
sudo systemctl restart proxy-manager

# Update Node.js
sudo apt update
sudo apt upgrade nodejs

# Backup
tar czf backup-$(date +%Y%m%d).tar.gz /opt/proxy-manager/{configs,data,.env}
```

---

## 📝 Notes

- Setup script otomatis, tapi user perlu copy app.js & web UI
- Web UI bisa diakses dari browser (tidak perlu Electron)
- Semua config disimpan di `/opt/proxy-manager/data/state.json`
- Logs lengkap di `/opt/proxy-manager/logs/`
- API compatible dengan Python version 100%

---

**Generated**: 2024  
**Version**: 1.0.0  
**Compatibility**: Ubuntu 18.04+, Node.js 14+
