# VPN to Proxy Manager

🚀 **VPN to Proxy Manager** - Tạo dàn proxy SOCKS5/HTTP riêng từ VPN Surfshark với giao diện Web UI toàn chức năng.

## ✨ Tính Năng

- 🔒 **Kết nối VPN** - Hỗ trợ WireGuard và OpenVPN
- 🔄 **Rotating IP** - Tự động xoay IP theo thời gian hoặc theo cầu
- 🌐 **SOCKS5 & HTTP Proxy** - Cổng proxy riêng biệt
- 📊 **Web UI Trực Quan** - Dashboard quản lý real-time
- 🔌 **WebSocket Live Updates** - Cập nhật trạng thái tức thì
- 🛡️ **Auto Recovery** - Tự động khôi phục kết nối khi bị ngắt
- 📝 **Activity Logs** - Lịch sử hoạt động chi tiết
- 💻 **Nhẹ Máy** - Tiêu tốn tài nguyên thấp
- 🐳 **Docker Support** - Deploy dễ dàng trên Ubuntu VPS

## 📋 Yêu Cầu

- **OS**: Ubuntu 20.04+ hoặc Docker
- **Node.js**: v18+
- **Tài khoản Surfshark**: Với tính năng VPN hoạt động
- **Port**: 3000 (Web UI), 1080 (SOCKS5), 8888 (HTTP Proxy)

## 🚀 Cài Đặt

### Phương Pháp 1: Direct Install (Ubuntu VPS)

```bash
# Clone project
git clone <repo-url> /opt/vpn-to-proxy
cd /opt/vpn-to-proxy

# Chạy script cài đặt
sudo bash scripts/install.sh

# Cấu hình credentials
sudo nano /etc/vpn-to-proxy/.env

# Bổ sung các thông tin:
# SURFSHARK_USER=your_username
# SURFSHARK_PASS=your_password
# API_KEY=your-random-api-key

# Khởi động dịch vụ
sudo systemctl start vpn-to-proxy
sudo systemctl enable vpn-to-proxy

# Kiểm tra trạng thái
sudo systemctl status vpn-to-proxy
```

### Phương Pháp 2: Docker Compose

```bash
# Clone project
git clone <repo-url>
cd vpn-to-proxy

# Tạo .env file
cp .env.example .env

# Chỉnh sửa .env với credentials của bạn
nano .env

# Build và chạy
docker-compose up -d

# Kiểm tra logs
docker-compose logs -f vpn-proxy
```

## ⚙️ Cấu Hình

### File .env

```env
# Surfshark Credentials
SURFSHARK_USER=your_surfshark_username
SURFSHARK_PASS=your_surfshark_password

# VPN Protocol: wireguard hoặc openvpn
VPN_PROTOCOL=wireguard

# Proxy Ports
SOCKS5_PORT=1080
HTTP_PROXY_PORT=8888
MANAGEMENT_PORT=3000

# VPN Location (Surfshark server)
VPN_LOCATION=us-nyc

# Auto Rotating
AUTO_ROTATE=true
ROTATE_INTERVAL_MINUTES=30
ROTATE_ON_CONNECTION_FAIL=true

# Recovery Settings
RECOVERY_CHECK_INTERVAL=60
RECOVERY_MAX_ATTEMPTS=5

# Logging
LOG_LEVEL=info

# Web UI
WEB_UI_ENABLED=true
API_KEY_ENABLED=true
API_KEY=your-random-api-key-here
```

## 🌍 Vị Trí VPN Surfshark Có Sẵn

```
us-nyc      - New York, USA
us-la       - Los Angeles, USA
us-chi      - Chicago, USA
gb-lon      - London, UK
fr-par      - Paris, France
de-ber      - Berlin, Germany
nl-ams      - Amsterdam, Netherlands
se-sto      - Stockholm, Sweden
ch-zrh      - Zurich, Switzerland
jp-tok      - Tokyo, Japan
sg-sgp      - Singapore
au-syd      - Sydney, Australia
ca-tor      - Toronto, Canada
mx-cdmx     - Mexico City, Mexico
br-sao      - Sao Paulo, Brazil
```

## 🖥️ Sử Dụng Web UI

### Truy Cập Dashboard

```
http://YOUR_VPS_IP:3000
```

### Các Chức Năng Chính

1. **VPN Status**
   - Xem trạng thái kết nối VPN
   - Xem IP hiện tại
   - Thay đổi vị trí server
   - Xoay IP
   - Kết nối/Ngắt kết nối

2. **Proxy Servers**
   - SOCKS5 trên cổng 1080
   - HTTP Proxy trên cổng 8888
   - Số lượng kết nối hoạt động

3. **System Resources**
   - CPU Usage
   - Memory Usage
   - Uptime

4. **Active Connections**
   - Danh sách các kết nối hiện tại
   - IP và cổng nguồn

5. **Settings**
   - Cấu hình tự động xoay IP
   - Thông tin giao thức VPN
   - Export cấu hình

## 📡 API Endpoints

### VPN API

```bash
# Lấy trạng thái VPN
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/vpn/status

# Xoay IP
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/vpn/rotate

# Thay đổi vị trí
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/vpn/location/gb-lon

# Danh sách vị trí
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/vpn/locations

# Kết nối VPN
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/vpn/connect

# Ngắt VPN
curl -X POST -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/vpn/disconnect
```

### Proxy API

```bash
# Trạng thái proxy
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/proxy/status

# Danh sách kết nối
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/proxy/connections
```

### System API

```bash
# Thông tin hệ thống
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/system/info

# Tài nguyên hệ thống
curl -H "Authorization: Bearer YOUR_API_KEY" http://localhost:3000/api/system/resources
```

## 🔌 Sử Dụng SOCKS5 Proxy

### Linux/macOS

```bash
# Với curl
curl --socks5 YOUR_VPS_IP:1080 https://api.ipify.org

# Với wget
wget --socks5-hostname=YOUR_VPS_IP:1080 -O - https://api.ipify.org

# Với environment variable
export https_proxy=socks5://YOUR_VPS_IP:1080
curl https://api.ipify.org
```

### Browser (Firefox)

1. Preferences → Network Settings
2. Manual proxy configuration
3. SOCKS Host: `YOUR_VPS_IP`
4. Port: `1080`
5. SOCKS v5

### Application (Python)

```python
import requests

proxies = {
    'http': 'socks5://YOUR_VPS_IP:1080',
    'https': 'socks5://YOUR_VPS_IP:1080'
}

response = requests.get('https://api.ipify.org', proxies=proxies)
print(response.text)
```

## 🔌 Sử Dụng HTTP Proxy

```bash
curl -x http://YOUR_VPS_IP:8888 https://api.ipify.org
```

## 🔍 Troubleshooting

### VPN không kết nối

```bash
# Kiểm tra logs
sudo journalctl -u vpn-to-proxy -f

# Kiểm tra WireGuard/OpenVPN
sudo wg show              # WireGuard
sudo systemctl status openvpn  # OpenVPN
```

### Proxy không hoạt động

```bash
# Kiểm trace socket
netstat -tlnp | grep -E '1080|8888'

# Test kết nối
curl --socks5 127.0.0.1:1080 https://api.ipify.org
```

### Quá trình bị crash

```bash
# Kiểm tra logs
docker logs vpn-to-proxy

# Hoặc journalctl
sudo journalctl -u vpn-to-proxy -n 100
```

## 📊 Monitoring

### Systemd Service

```bash
# Trạng thái
sudo systemctl status vpn-to-proxy

# Logs real-time
sudo journalctl -u vpn-to-proxy -f

# Logs với keyword
sudo journalctl -u vpn-to-proxy | grep -i "error"
```

### Docker

```bash
# Logs
docker-compose logs -f vpn-proxy

# Stats
docker stats vpn-to-proxy
```

## 🔐 Bảo Mật

- ✅ Mọi API endpoint đều yêu cầu API Key
- ✅ HTTPS hỗ trợ (cấu hình nginx proxy)
- ✅ Tài khoản hệ thống không-root
- ✅ File .env có quyền 600

### Cấu Hình Nginx Reverse Proxy (HTTPS)

```nginx
server {
    listen 443 ssl http2;
    server_name vpn-proxy.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/vpn-proxy.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vpn-proxy.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📈 Performance

- **Memory**: ~150-200 MB (idle)
- **CPU**: < 5% (idle), ~20-30% (rotating)
- **Disk**: ~500 MB (application)

## 🐛 Debugging

```bash
# Enable debug logs
LOG_LEVEL=debug node src/index.js

# Check network status
ip addr show
ip route show

# Monitor connections
watch -n 1 'netstat -tlnp | grep -E "1080|8888|3000"'
```

## 📄 Licenses

MIT License - Xem file LICENSE

## 🤝 Support

- 📧 Email: support@example.com
- 🐛 Issues: GitHub Issues
- 📚 Docs: Wiki

## 📝 Changelog

### v1.0.0
- ✅ Release đầu tiên
- ✅ SOCKS5 & HTTP Proxy
- ✅ WireGuard & OpenVPN support
- ✅ Rotating IP
- ✅ Web UI
- ✅ Auto Recovery
- ✅ Docker support

---

**Made with ❤️ for Surfshark users**
