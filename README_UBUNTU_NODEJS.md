# Proxy Manager - Ubuntu Node.js Implementation
## Complete Setup Package

Phiên bản Node.js của Surf Proxy Manager, tối ưu hóa cho Ubuntu VPS.

---

## 📦 Tất Cả File Được Tạo

| File | Kích Thước | Mục Đích |
|------|-----------|---------|
| `ubuntu-nodejs-setup.sh` | 7.2 KB | Setup script chính (tự động cài mọi thứ) |
| `nodejs-app.js` | 28 KB | Main Node.js application |
| `nodejs-web-ui.html` | 32 KB | Web UI dashboard |
| `.env.example-ubuntu` | 3.1 KB | Configuration template |
| `ubuntu-nodejs-README.md` | 9.6 KB | Hướng dẫn chi tiết |
| `QUICK_START_UBUNTU.md` | 5.9 KB | Quick start 5 phút |
| `DEPLOYMENT_CHECKLIST.md` | 9.8 KB | Checklist triển khai |
| `UBUNTU_NODEJS_FILES_MANIFEST.md` | 14 KB | Mô tả chi tiết từng file |
| `README_UBUNTU_NODEJS.md` | File này | Tổng quan toàn bộ |

**Tổng kích thước**: ~109 KB (không tính node_modules, wireproxy)

---

## 🎯 Tính Năng

✅ **Multi-Tunnel Management** - Quản lý nhiều WireGuard tunnel cùng lúc  
✅ **SOCKS5 & HTTP Proxy** - Xuất cả SOCKS5 và HTTP proxy  
✅ **Auto Health Check** - Kiểm tra sức khỏe, tự khởi động lại khi lỗi  
✅ **IP Rotation** - Xoay IP theo lịch hoặc thủ công  
✅ **Web UI** - Dashboard quản lý trực quan  
✅ **Config Upload** - Nạp file WireGuard qua Web UI  
✅ **Proxy Export** - Xuất danh sách proxy nhiều định dạng  
✅ **Authentication** - Hỗ trợ username/password cho proxy  
✅ **Systemd Integration** - Chạy như service, tự khởi động  
✅ **Comprehensive Logging** - Log chi tiết mọi hoạt động  

---

## 🚀 Quick Start (5 Phút)

### 1. Download & Setup

```bash
# SSH vào Ubuntu VPS
ssh user@vps_ip

# Download setup script
curl -fsSL https://your-domain/ubuntu-nodejs-setup.sh -o setup.sh
chmod +x setup.sh

# Chạy setup (cần sudo)
sudo ./setup.sh

# Thời gian: ~2-5 phút
```

### 2. Copy Application

```bash
cd /opt/proxy-manager

# Copy app.js
sudo cp /path/to/nodejs-app.js app.js

# Copy web UI
sudo mkdir -p web
sudo cp /path/to/nodejs-web-ui.html web/index.html
```

### 3. Start Service

```bash
# Khởi động
sudo systemctl start proxy-manager

# Tự khởi động
sudo systemctl enable proxy-manager
```

### 4. Access

Mở trình duyệt: **http://VPS_IP:8686**

### 5. Add Config & Create Tunnel

1. Web UI → "Nạp file .conf" → Upload WireGuard config  
2. Web UI → "Tạo tunnel" → Chọn config → "Tạo"  
3. Đợi LED xanh → Sử dụng proxy

**Xong! Bạn đã có proxy chạy.**

---

## 📚 Documentation

### Để Bắt Đầu Nhanh
→ Đọc: **`QUICK_START_UBUNTU.md`**

### Cấu Hình Chi Tiết
→ Đọc: **`ubuntu-nodejs-README.md`**

### Triển Khai Sản Xuất
→ Đọc: **`DEPLOYMENT_CHECKLIST.md`**

### Chi Tiết Kỹ Thuật
→ Đọc: **`UBUNTU_NODEJS_FILES_MANIFEST.md`**

---

## 🔧 File Descriptions

### `ubuntu-nodejs-setup.sh`
**Tự động hóa toàn bộ setup**
- Cập nhật hệ thống Ubuntu
- Cài đặt Node.js 20
- Tải wireproxy binary
- Tạo thư mục & permissions
- Tạo systemd service
- Cấu hình firewall (UFW)

Chỉ cần chạy 1 lần: `sudo bash ubuntu-nodejs-setup.sh`

### `nodejs-app.js`
**Main application**
- HTTP server (Express-like)
- WireGuard config management
- Tunnel lifecycle (start/stop/rotate)
- Health checks & supervision
- Logging & state management
- REST API endpoints

Khởi động: `node app.js` hoặc `systemctl start proxy-manager`

### `nodejs-web-ui.html`
**Web UI dashboard**
- Tunnel management interface
- Config file upload
- Proxy export
- Health monitoring
- Real-time status updates
- Dark/Light mode
- Fully responsive

Truy cập: `http://VPS_IP:8686`

### `.env.example-ubuntu`
**Configuration template**

Copy thành `.env` và điều chỉnh:
```bash
cp .env.example-ubuntu .env
nano .env  # Sửa nếu cần
```

Các biến chính:
- `APP_PORT=8686` - Web UI port
- `SOCKS_BASE_PORT=20001` - SOCKS5 base
- `HTTP_BASE_PORT=30001` - HTTP base
- `APP_PASSWORD=` - Để trống hoặc đặt password

---

## 📋 Folder Structure

Sau khi setup:

```
/opt/proxy-manager/
├── app.js                    # Main app
├── package.json              # npm packages
├── .env                      # Configuration
├── web/index.html            # Web UI
├── bin/wireproxy             # WireGuard binary
├── configs/                  # WireGuard .conf files
│   ├── us-west.conf
│   ├── eu-london.conf
│   └── ...
├── runtime/                  # Runtime configs (auto)
├── logs/                     # Application logs
│   ├── app.log
│   ├── <tunnel_id>.log
│   └── ...
├── data/                     # Persistent data
│   └── state.json
└── node_modules/             # npm dependencies
```

---

## 🎓 Usage Examples

### Tạo Tunnel

```javascript
// Web UI atau API
POST /api/tunnels
{
  "name": "US Proxy",
  "confs": ["us-west.conf"],
  "socks_port": 20001,
  "http_port": 30001,
  "bind": "127.0.0.1",
  "random_server": true,
  "enabled": true
}
```

### Sử Dụng Proxy

**Python**:
```python
import requests
proxies = {
    'http': 'http://127.0.0.1:30001',
    'https': 'http://127.0.0.1:30001'
}
requests.get('http://example.com', proxies=proxies)
```

**Node.js**:
```javascript
const { HttpProxyAgent } = require('http-proxy-agent');
const http = require('http');

const agent = new HttpProxyAgent('http://127.0.0.1:30001');
http.get('http://example.com', { agent }, callback);
```

**cURL**:
```bash
curl -x socks5://127.0.0.1:20001 http://example.com
curl -x http://127.0.0.1:30001 http://example.com
```

### Export Proxy List

**Web UI**: "Xuất cho GPM Login" → Copy danh sách

**API**:
```bash
curl http://127.0.0.1:8686/api/export?fmt=host_port&proto=socks5
```

Output:
```
127.0.0.1:20001
127.0.0.1:20002
127.0.0.1:20003
```

---

## 🔐 Security

1. **Web UI Password** - Đặt nếu expose ra LAN
2. **Firewall** - UFW auto-configured, restrict ports
3. **Private Keys** - Không bao giờ hiển thị, chỉ hash
4. **Basic Auth** - HTTP Basic authentication
5. **Systemd** - Service runs as root (required)

---

## 📊 Monitoring & Logs

### View Logs

```bash
# Real-time logs
sudo journalctl -u proxy-manager -f

# Last 50 lines
sudo journalctl -u proxy-manager -n 50

# Application log
tail -f /opt/proxy-manager/logs/app.log

# Tunnel specific log
tail -f /opt/proxy-manager/logs/<tunnel_id>.log
```

### Check Status

```bash
# Service status
sudo systemctl status proxy-manager

# Process check
ps aux | grep -E 'node|wireproxy'

# Port check
sudo ss -tlnp | grep -E '8686|200[0-9]|300[0-9]'

# Resource usage
top -p $(pgrep -f 'node app')
```

---

## 🔄 Management

### Systemd Commands

```bash
# Start
sudo systemctl start proxy-manager

# Stop
sudo systemctl stop proxy-manager

# Restart
sudo systemctl restart proxy-manager

# Status
sudo systemctl status proxy-manager

# Enable auto-start
sudo systemctl enable proxy-manager

# Disable auto-start
sudo systemctl disable proxy-manager

# View logs
sudo journalctl -u proxy-manager -f
```

### Manual Commands

```bash
# Start manually
cd /opt/proxy-manager && node app.js

# Development mode
cd /opt/proxy-manager && NODE_ENV=development node app.js

# Stop (Ctrl+C)
```

---

## 🛠️ Troubleshooting

### ❌ "Web UI not accessible"

```bash
# 1. Check if service is running
sudo systemctl status proxy-manager

# 2. Check port
sudo ss -tlnp | grep 8686

# 3. Check firewall
sudo ufw status

# 4. Check logs
sudo journalctl -u proxy-manager -n 20
```

### ❌ "Port already in use"

```bash
# Find what's using port
sudo lsof -i :8686

# Change port in .env
APP_PORT=8687
sudo systemctl restart proxy-manager
```

### ❌ "wireproxy not found"

```bash
# Download manually
cd /opt/proxy-manager/bin
curl -fsSL https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_linux_amd64.tar.gz | tar xz wireproxy
chmod +x wireproxy
sudo systemctl restart proxy-manager
```

### ❌ "Tunnel won't start"

```bash
# 1. Check config file
cat /opt/proxy-manager/configs/filename.conf

# 2. View tunnel logs
tail -f /opt/proxy-manager/logs/<tunnel_id>.log

# 3. Check ports are free
sudo ss -tlnp | grep -E '20001|30001'

# 4. Restart service
sudo systemctl restart proxy-manager
```

---

## 📈 Performance Tips

1. **Limit Tunnels**: < 100 tunnels per VPS
2. **Disable Health Check**: Set to 0 if not needed
3. **Increase Keepalive**: Adjust KEEPALIVE in .env
4. **Use SSD**: Better for logs/state.json
5. **Monitor Resources**: CPU < 50%, RAM < 500MB

---

## 🔄 Updates

### Update Node.js

```bash
sudo apt update
sudo apt upgrade nodejs
sudo systemctl restart proxy-manager
```

### Update wireproxy

```bash
cd /opt/proxy-manager/bin
curl -fsSL https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_linux_amd64.tar.gz | tar xz wireproxy
chmod +x wireproxy
sudo systemctl restart proxy-manager
```

### Backup Configuration

```bash
# Create backup
tar czf proxy-backup-$(date +%Y%m%d).tar.gz \
  /opt/proxy-manager/{configs,data,.env}

# Restore backup
tar xzf proxy-backup-20240101.tar.gz -C /
sudo systemctl restart proxy-manager
```

---

## 📞 Support

### Documentation
- `README_UBUNTU_NODEJS.md` - Tổng quan (file này)
- `QUICK_START_UBUNTU.md` - Quick start
- `ubuntu-nodejs-README.md` - Chi tiết đầy đủ
- `DEPLOYMENT_CHECKLIST.md` - Triển khai
- `UBUNTU_NODEJS_FILES_MANIFEST.md` - Mô tả files

### Debug

```bash
# Check everything
echo "=== Service ===" && sudo systemctl status proxy-manager
echo "=== Ports ===" && sudo ss -tlnp | grep -E '8686|200[0-9]'
echo "=== Logs ===" && sudo journalctl -u proxy-manager -n 10
echo "=== Resources ===" && ps aux | grep node
echo "=== Configs ===" && ls -la /opt/proxy-manager/configs/
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Port in use | Change in .env, restart |
| Can't access Web UI | Check firewall, check service running |
| Tunnel won't start | Check .conf file, check logs |
| Proxy not working | Test: `curl -x socks5://...` |
| High CPU/Memory | Reduce tunnels, optimize settings |
| wireproxy errors | Update wireproxy binary |

---

## 📋 Comparison with Python Version

| Feature | Python | Node.js |
|---------|--------|---------|
| Platform | Windows Desktop | Ubuntu VPS |
| Language | Python 3.9+ | Node.js 14+ |
| UI | Electron-like | Web-based |
| Service | Task Scheduler | systemd |
| Same API | ✅ Yes | ✅ Yes |
| Same Config | ✅ Yes | ✅ Yes |
| 100% Compatible | ✅ Yes | ✅ Yes |

---

## ✅ Verification Checklist

```bash
# 1. Service running
sudo systemctl status proxy-manager

# 2. Web UI accessible
curl http://127.0.0.1:8686/ | head -5

# 3. All directories exist
ls -d /opt/proxy-manager/{configs,logs,runtime,data,bin}

# 4. Files present
ls /opt/proxy-manager/app.js /opt/proxy-manager/web/index.html

# 5. wireproxy executable
/opt/proxy-manager/bin/wireproxy --version

# 6. Ports free
sudo ss -tlnp | grep 8686

# ✅ All OK!
```

---

## 🎓 Next Steps

1. **Read Documentation**
   - Start: `QUICK_START_UBUNTU.md` (5 min)
   - Full: `ubuntu-nodejs-README.md` (30 min)

2. **Deploy**
   - Follow: `DEPLOYMENT_CHECKLIST.md`
   - Estimated time: 10-15 min

3. **Configure**
   - Upload WireGuard configs
   - Create tunnels
   - Test proxies

4. **Operate**
   - Monitor via Web UI
   - Check logs regularly
   - Update regularly

---

## 📄 License

MIT License - Tự do sử dụng, sửa đổi, phân phối

---

## 🙋 FAQ

**Q: Có thể chạy trên Windows không?**
A: Không, setup script là cho Ubuntu VPS. Python version hoạt động trên Windows.

**Q: Tối đa bao nhiêu tunnels?**
A: Tuỳ theo resources. Khuyến nghị < 100 per VPS.

**Q: Có thể dùng từ máy khác không?**
A: Có. Set `APP_HOST=0.0.0.0` trong .env (cần password).

**Q: WireGuard configs có được lưu an toàn không?**
A: Có. Private keys masked trong UI, lưu an toàn trên disk.

**Q: Có hỗ trợ IPv6 không?**
A: Có, nếu wireproxy support (phụ thuộc version).

**Q: Khi nào cần khởi động lại?**
A: Sau thay đổi .env, update Node.js/wireproxy.

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Status**: Production Ready ✅

---

**🎉 Bạn đã sẵn sàng triển khai Proxy Manager trên Ubuntu VPS!**

Bắt đầu với: `QUICK_START_UBUNTU.md`
