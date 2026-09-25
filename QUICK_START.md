# ⚡ Quick Start Guide

## 🎯 5 Phút Setup (Ubuntu VPS)

### Step 1: Clone Repository

```bash
sudo mkdir -p /opt/vpn-to-proxy
cd /opt/vpn-to-proxy
sudo git clone <your-repo-url> .
```

### Step 2: Run Installation Script

```bash
sudo bash scripts/install.sh
```

> ⏱️ Điều này sẽ tự động:
> - Cài Node.js 18
> - Cài WireGuard & OpenVPN
> - Thiết lập systemd service

### Step 3: Cấu Hình Credentials

```bash
# Edit configuration
sudo nano /etc/vpn-to-proxy/.env

# Thêm dòng sau:
SURFSHARK_USER=your_email@example.com
SURFSHARK_PASS=your_password
API_KEY=$(openssl rand -hex 32)
VPN_LOCATION=us-nyc
```

Ctrl+X → Y → Enter để lưu

### Step 4: Khởi Động Service

```bash
sudo systemctl start vpn-to-proxy
sudo systemctl enable vpn-to-proxy
```

### Step 5: Truy Cập Web UI

Mở browser:
```
http://YOUR_VPS_IP:3000
```

✅ **Done!** Bạn đã setup xong VPN to Proxy Manager!

---

## 🔌 Test Proxy Ngay Lập Tức

### SOCKS5 (Từ bất kỳ máy nào)

```bash
curl --socks5 YOUR_VPS_IP:1080 https://api.ipify.org
```

### HTTP Proxy

```bash
curl -x http://YOUR_VPS_IP:8888 https://api.ipify.org
```

### Expected Output:
```
123.45.67.89  (Surfshark IP, không phải IP thật của bạn)
```

---

## 📊 Kiểm Tra Trạng Thái

```bash
# Xem logs
sudo journalctl -u vpn-to-proxy -f

# Kiểm tra service
sudo systemctl status vpn-to-proxy

# Kiểm tra ports
sudo netstat -tlnp | grep -E '3000|1080|8888'
```

---

## 🐳 Docker Alternative (5 phút)

```bash
# Clone repo
git clone <repo-url>
cd vpn-to-proxy

# Tạo .env
cat > .env << 'EOF'
SURFSHARK_USER=your_email@example.com
SURFSHARK_PASS=your_password
API_KEY=your-random-key
EOF

# Run Docker
docker-compose up -d

# Logs
docker-compose logs -f
```

Truy cập: `http://localhost:3000`

---

## 🔧 Cần Giúp Đỡ?

### VPN không kết nối?

```bash
sudo journalctl -u vpn-to-proxy | grep -i error
```

### Port bị chiếm?

```bash
sudo lsof -i :1080
```

### Reset lại tất cả

```bash
sudo systemctl stop vpn-to-proxy
sudo systemctl restart vpn-to-proxy
```

---

## 📚 Tiếp Theo

- 📖 Đọc [README.md](./README.md) cho tất cả tính năng
- 🚀 [DEPLOYMENT.md](./DEPLOYMENT.md) để cấu hình HTTPS
- 🔒 [SURFSHARK_SETUP.md](./SURFSHARK_SETUP.md) cho Surfshark config

---

**Made with ❤️ for Surfshark users**
