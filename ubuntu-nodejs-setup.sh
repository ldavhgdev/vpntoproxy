#!/bin/bash
# ============================================================================
# Ubuntu VPS Setup Script for Proxy Manager (Node.js)
# ============================================================================
# Cài đặt và chạy Proxy Manager trên Ubuntu VPS
# Prerequisites: Ubuntu 18.04+

set -e

# Màu sắc
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[✓]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $*"; }
log_error() { echo -e "${RED}[✗]${NC} $*"; }

# Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  log_error "Script phải chạy với quyền root (sudo)"
  exit 1
fi

INSTALL_DIR="/opt/proxy-manager"
REPO_URL="${1:-https://github.com/pufferffish/wireproxy}"
INSTALL_LOG="/tmp/proxy-manager-install.log"

log_info "========================================="
log_info "Proxy Manager Setup for Ubuntu"
log_info "========================================="
log_info "Thư mục cài đặt: $INSTALL_DIR"
log_info "Log file: $INSTALL_LOG"

# ===== Cập nhật hệ thống =====
log_info "Bước 1: Cập nhật hệ thống..."
apt-get update >> "$INSTALL_LOG" 2>&1
apt-get upgrade -y >> "$INSTALL_LOG" 2>&1
log_success "Hệ thống đã cập nhật"

# ===== Cài đặt các gói cần thiết =====
log_info "Bước 2: Cài đặt các gói phụ thuộc..."
PACKAGES=(
  "curl"
  "wget"
  "jq"
  "git"
  "build-essential"
  "openssl"
  "ca-certificates"
)

for pkg in "${PACKAGES[@]}"; do
  if ! dpkg -l | grep -q "^ii  $pkg"; then
    log_info "  - Cài đặt $pkg..."
    apt-get install -y "$pkg" >> "$INSTALL_LOG" 2>&1
  fi
done
log_success "Gói phụ thuộc đã cài đặt"

# ===== Cài đặt Node.js =====
log_info "Bước 3: Cài đặt Node.js..."
if ! command -v node &> /dev/null; then
  log_info "  - Cài đặt NodeSource repository..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >> "$INSTALL_LOG" 2>&1
  apt-get install -y nodejs >> "$INSTALL_LOG" 2>&1
  log_success "Node.js $(node --version) đã cài đặt"
else
  log_success "Node.js $(node --version) đã có sẵn"
fi

# ===== Tạo thư mục cài đặt =====
log_info "Bước 4: Tạo thư mục cài đặt..."
mkdir -p "$INSTALL_DIR"/{bin,configs,runtime,logs,web,data}
cd "$INSTALL_DIR"
log_success "Thư mục đã tạo"

# ===== Download wireproxy =====
log_info "Bước 5: Download wireproxy..."
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64) ARCH="arm64" ;;
  armv7l) ARCH="armv6" ;;
esac

ASSET="wireproxy_linux_${ARCH}.tar.gz"
REPOS=("pufferffish" "whyvl" "windtf")
DOWNLOADED=false

for REPO in "${REPOS[@]}"; do
  URL="https://github.com/${REPO}/wireproxy/releases/latest/download/${ASSET}"
  if curl -fsSL --head "$URL" &> /dev/null; then
    log_info "  - Tải từ $REPO/wireproxy..."
    cd "$INSTALL_DIR/bin"
    curl -fsSL "$URL" | tar xz wireproxy
    chmod +x wireproxy
    ./wireproxy --version
    log_success "wireproxy đã tải"
    DOWNLOADED=true
    break
  fi
done

if [ "$DOWNLOADED" = false ]; then
  log_error "Không thể tải wireproxy. Kiểm tra kết nối internet."
  exit 1
fi

# ===== Tạo file cấu hình mẫu =====
log_info "Bước 6: Tạo cấu hình mẫu..."
cat > "$INSTALL_DIR/configs/example.conf" << 'EOF'
[Interface]
PrivateKey = YOUR_PRIVATE_KEY_HERE
Address = 10.0.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = YOUR_PEER_PUBLIC_KEY
Endpoint = endpoint.example.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
EOF
log_success "Cấu hình mẫu đã tạo"

# ===== Tạo package.json =====
log_info "Bước 7: Cấu hình Node.js project..."
cat > "$INSTALL_DIR/package.json" << 'EOF'
{
  "name": "proxy-manager",
  "version": "1.0.0",
  "description": "VPN to SOCKS5/HTTP Proxy Manager",
  "main": "app.js",
  "scripts": {
    "start": "node app.js",
    "dev": "node app.js --dev",
    "install-systemd": "sudo node scripts/install-systemd.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "body-parser": "^1.20.2",
    "multer": "^1.4.5-lts.1",
    "node-cache": "^5.1.2",
    "dotenv": "^16.3.1"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
EOF

log_success "package.json đã tạo"

# ===== Cài đặt npm dependencies =====
log_info "Bước 8: Cài đặt npm dependencies..."
npm install >> "$INSTALL_LOG" 2>&1
log_success "Dependencies đã cài đặt"

# ===== Tạo .env =====
log_info "Bước 9: Tạo file .env..."
cat > "$INSTALL_DIR/.env" << EOF
NODE_ENV=production
APP_HOST=0.0.0.0
APP_PORT=8686
SOCKS_BASE_PORT=20001
HTTP_BASE_PORT=30001
HEALTH_CHECK_INTERVAL=30
FAIL_THRESHOLD=3
KEEPALIVE=25
APP_PASSWORD=
LOG_DIR=$INSTALL_DIR/logs
CONFIG_DIR=$INSTALL_DIR/configs
RUNTIME_DIR=$INSTALL_DIR/runtime
BIN_DIR=$INSTALL_DIR/bin
EOF
log_success ".env đã tạo"

# ===== Tạo systemd service =====
log_info "Bước 10: Tạo systemd service..."
cat > "/etc/systemd/system/proxy-manager.service" << EOF
[Unit]
Description=Proxy Manager - VPN to SOCKS5/HTTP Proxy
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/node app.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
log_success "Systemd service đã tạo"

# ===== Quyền truy cập =====
log_info "Bước 11: Cấu hình quyền truy cập..."
chmod -R 755 "$INSTALL_DIR"
chmod 600 "$INSTALL_DIR/.env"
log_success "Quyền truy cập đã cấu hình"

# ===== Tường lửa =====
log_info "Bước 12: Cấu hình tường lửa (UFW)..."
if command -v ufw &> /dev/null && ufw status | grep -q active; then
  ufw allow 8686/tcp comment "Proxy Manager UI" 2>/dev/null || true
  ufw allow 20001:20100/tcp comment "SOCKS5 Proxies" 2>/dev/null || true
  ufw allow 30001:30100/tcp comment "HTTP Proxies" 2>/dev/null || true
  log_success "UFW rules đã thêm"
else
  log_warn "UFW không có sẵn hoặc chưa kích hoạt - hãy cấu hình manually nếu cần"
fi

# ===== Hướng dẫn tiếp theo =====
log_info "========================================="
log_success "Cài đặt hoàn tất!"
log_info "========================================="
cat << EOF

📝 BƯỚC TIẾP THEO:

1. Cấu hình WireGuard configs:
   cd $INSTALL_DIR/configs
   # Thêm các file .conf của Surfshark hoặc VPN khác

2. Tạo app.js (xem file nodejs-app.js)
3. Tạo web UI (xem file nodejs-web-ui.html)

4. Khởi động dịch vụ:
   sudo systemctl start proxy-manager
   sudo systemctl enable proxy-manager  # Tự khởi động

5. Kiểm tra trạng thái:
   sudo systemctl status proxy-manager
   sudo journalctl -u proxy-manager -f

6. Truy cập web UI:
   http://YOUR_VPS_IP:8686

📋 FILE MẪU:
   - Cấu hình: $INSTALL_DIR/configs/example.conf
   - Logs: $INSTALL_DIR/logs/
   - Runtime: $INSTALL_DIR/runtime/

⚙️  Lệnh hữu ích:
   # Dừng dịch vụ
   sudo systemctl stop proxy-manager

   # Xem logs
   sudo journalctl -u proxy-manager -n 100 -f

   # Kiểm tra cổng
   sudo ss -tlnp | grep proxy-manager

📖 Tài liệu: https://github.com/pufferffish/wireproxy

EOF

log_success "Setup script hoàn tất. Xem hướng dẫn trên!"
