# Proxy Manager - Node.js Version for Ubuntu VPS

Chuyển đổi cấu hình WireGuard thành các proxy SOCKS5/HTTP riêng biệt, chạy trên Ubuntu VPS.

## Tính Năng

- ✅ Quản lý nhiều WireGuard tunnel cùng lúc
- ✅ Xuất proxy SOCKS5 và HTTP cho mỗi tunnel
- ✅ Hỗ trợ xoay IP theo lịch hoặc theo yêu cầu
- ✅ Kiểm tra sức khỏe tự động, tự khởi động lại khi lỗi
- ✅ Web UI quản lý trực quan
- ✅ Hỗ trợ xác thực (username/password) cho proxy
- ✅ Tải cấu hình qua Web UI
- ✅ Export danh sách proxy ở nhiều định dạng
- ✅ Chạy như systemd service

## Yêu Cầu

- **Ubuntu 18.04+** (LTS recommended)
- **Node.js 14+** (sẽ được cài đặt tự động)
- **wireproxy** (sẽ được tải về tự động)
- Quyền root/sudo
- Kết nối internet

## Cài Đặt Nhanh

### 1. Download Setup Script

```bash
curl -fsSL https://example.com/ubuntu-nodejs-setup.sh -o setup.sh
chmod +x setup.sh
sudo ./setup.sh
```

Hoặc copy file `ubuntu-nodejs-setup.sh` và chạy:

```bash
sudo bash ubuntu-nodejs-setup.sh
```

### 2. Sau khi cài đặt

```bash
cd /opt/proxy-manager

# Copy app.js và web UI
cp /path/to/nodejs-app.js app.js
mkdir -p web
cp /path/to/nodejs-web-ui.html web/index.html

# Khởi động dịch vụ
sudo systemctl start proxy-manager
sudo systemctl enable proxy-manager
```

### 3. Truy cập Web UI

Mở trình duyệt:
```
http://YOUR_VPS_IP:8686
```

## Cầu Hình

### 1. Tải File WireGuard Config

Trên Surfshark hoặc NordVPN:
1. Đăng nhập vào trang quản lý VPN
2. Tìm mục VPN → Cài đặt thủ công → WireGuard
3. Tạo cặp khóa
4. Tải file `.conf` của các vị trí bạn cần
5. Trên Web UI → "Nạp file .conf" → Chọn các file đã tải

### 2. Tạo Tunnel

Web UI → "Tạo tunnel":
- **Tên**: Tùy chọn
- **Vị trí (file .conf)**: Chọn ít nhất 1 file
- **Cổng SOCKS5/HTTP**: Để trống để tự chọn, hoặc nhập cụ thể (1024-65535)
- **Xác thực**: Tùy chọn (cần nếu mở ra LAN)
- **Lắng nghe trên**: 
  - `127.0.0.1` - Chỉ máy VPS
  - `0.0.0.0` - Cả mạng LAN (bắt buộc có xác thực)
- **Tự đổi IP**: Nhập số phút, 0 = không tự đổi

### 3. Sử Dụng Proxy

Sau khi tunnel hoạt động (LED xanh):

**Xuất proxy**: Web UI → "Xuất cho GPM Login"

**Định dạng**:
- `host:port:user:pass`
- `socks5://host:port:user:pass`
- `socks5://user:pass@host:port`

**Dùng trong code**:
```javascript
const http = require('http');
const HttpProxyAgent = require('http-proxy-agent');

const proxy = 'http://127.0.0.1:20001';
const agent = new HttpProxyAgent(proxy);

http.get('http://example.com', { agent }, (res) => {
  // ...
});
```

## Quản Lý

### Systemd Service

```bash
# Khởi động
sudo systemctl start proxy-manager

# Dừng
sudo systemctl stop proxy-manager

# Tự khởi động khi boot
sudo systemctl enable proxy-manager

# Xem logs
sudo journalctl -u proxy-manager -n 100 -f

# Trạng thái
sudo systemctl status proxy-manager
```

### File và Thư Mục

```
/opt/proxy-manager/
├── app.js              # Main application
├── web/
│   └── index.html      # Web UI
├── package.json        # Node.js dependencies
├── .env                # Configuration
├── configs/            # WireGuard .conf files
├── runtime/            # Runtime configs (auto-generated)
├── logs/               # Log files
├── data/
│   ├── state.json      # Saved tunnels
│   └── app.log         # Application log
└── bin/
    └── wireproxy       # WireGuard proxy binary
```

### Cài Đặt

Web UI → "Cài đặt" → Customize:

| Tùy chọn | Mặc định | Ghi chú |
|---------|---------|--------|
| Kiểm tra kết nối (giây) | 30 | Kiểm tra IP sau mỗi X giây |
| Lỗi trước tự khởi động lại | 3 | Số lần check thất bại liên tiếp |
| Cổng SOCKS5 bắt đầu | 20001 | Các tunnel sẽ dùng từ cổng này |
| Cổng HTTP bắt đầu | 30001 | Các tunnel sẽ dùng từ cổng này |
| Keepalive WireGuard (giây) | 25 | Giữ kết nối sống |
| Cổng Web UI | 8686 | |
| Web UI lắng nghe | 127.0.0.1 | 0.0.0.0 = tất cả interfaces |
| Mật khẩu Web UI | (trống) | Bắt buộc nếu mở ra LAN |

## Khắc Phục Sự Cố

### wireproxy not found
```bash
# Tải lại wireproxy từ GitHub
sudo /opt/proxy-manager/bin/wireproxy --version

# Hoặc tải manual
cd /opt/proxy-manager/bin
curl -fsSL https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_linux_amd64.tar.gz | tar xz wireproxy
chmod +x wireproxy
```

### Port đã bị chiếm
```bash
# Kiểm tra cổng
sudo ss -tlnp | grep -E ':(8686|2000[0-9]|3000[0-9])'

# Thay đổi cổng trong .env
sudo nano /opt/proxy-manager/.env
# Hoặc dùng Web UI → Cài đặt
```

### Tunnel không kết nối được
```bash
# Xem logs
sudo journalctl -u proxy-manager -f

# Hoặc
sudo tail -f /opt/proxy-manager/logs/*.log
```

### Tường lửa (UFW)
```bash
# Mở cổng Web UI
sudo ufw allow 8686/tcp

# Mở cổng proxy (ví dụ: 20001-20020)
sudo ufw allow 20001:20020/tcp
sudo ufw allow 30001:30020/tcp
```

## Giới Hạn

- Mỗi tunnel dùng 1 tiến trình `wireproxy` riêng
- Giới hạn cổng: 1024-65535 (max ~40k tunnel)
- Khuyến nghị: < 100 tunnel / VPS để tránh quá tải

## Cấu Hình Nâng Cao

### .env File

```bash
sudo nano /opt/proxy-manager/.env
```

Các biến:

```env
NODE_ENV=production              # production hoặc development
APP_HOST=0.0.0.0                # 0.0.0.0 hoặc IP cụ thể
APP_PORT=8686                    # Web UI port
SOCKS_BASE_PORT=20001            # SOCKS5 ports bắt đầu từ
HTTP_BASE_PORT=30001             # HTTP ports bắt đầu từ
HEALTH_CHECK_INTERVAL=30         # Kiểm tra sức khỏe (giây)
FAIL_THRESHOLD=3                 # Lỗi trước tự khởi động
KEEPALIVE=25                     # WireGuard keepalive (giây)
APP_PASSWORD=                    # Web UI password (để trống = không)
LOG_DIR=/opt/proxy-manager/logs
CONFIG_DIR=/opt/proxy-manager/configs
RUNTIME_DIR=/opt/proxy-manager/runtime
BIN_DIR=/opt/proxy-manager/bin
```

Sau khi sửa, khởi động lại:
```bash
sudo systemctl restart proxy-manager
```

## API Endpoints

### GET

- `GET /api/state` - Trạng thái toàn bộ tunnels
- `GET /api/export?fmt=host_port&proto=socks5&ids=id1,id2` - Export proxy list
- `GET /api/confs/filename.conf` - Xem nội dung config

### POST

- `POST /api/tunnels` - Tạo tunnel
- `POST /api/tunnels/{id}/start` - Bật tunnel
- `POST /api/tunnels/{id}/stop` - Tắt tunnel
- `POST /api/tunnels/{id}/rotate` - Xoay IP
- `POST /api/tunnels/{id}/restart` - Khởi động lại
- `POST /api/tunnels/{id}/update` - Cập nhật config
- `POST /api/tunnels/{id}/delete` - Xóa tunnel
- `POST /api/bulk` - Thao tác hàng loạt
- `POST /api/confs/upload` - Tải lên .conf files
- `POST /api/confs/delete` - Xóa .conf file
- `POST /api/settings` - Lưu cài đặt

## Ví Dụ Sử Dụng

### Python + Requests

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.url import parse_url
from pysocks import ProxyManager

session = requests.Session()
proxy_url = 'socks5://127.0.0.1:20001'

response = session.get('http://httpbin.org/ip', proxies={
    'http': proxy_url,
    'https': proxy_url
})
print(response.json())
```

### Node.js + HTTP Proxy Agent

```javascript
const http = require('http');
const { HttpProxyAgent } = require('http-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyUrl = 'http://127.0.0.1:30001';  // HTTP proxy
const agent = new HttpProxyAgent(proxyUrl);

http.get('http://httpbin.org/ip', { agent }, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
});
```

### cURL

```bash
# SOCKS5
curl -x socks5://127.0.0.1:20001 http://httpbin.org/ip

# HTTP
curl -x http://127.0.0.1:30001 http://httpbin.org/ip

# Với xác thực
curl -x http://user:pass@127.0.0.1:30001 http://httpbin.org/ip
```

## Bảo Mật

1. **Đặt mật khẩu Web UI** nếu dùng trên mạng LAN
2. **Hạn chế cổng** bằng UFW/firewall
3. **Chạy với user khác** (tối ưu: tạo user `proxy-manager`)
4. **Cập nhật Node.js** thường xuyên
5. **Không để lộ khóa WireGuard**

## Backup/Restore

### Backup

```bash
cd /opt/proxy-manager
tar czf backup-$(date +%Y%m%d).tar.gz configs/ data/state.json .env
```

### Restore

```bash
cd /opt/proxy-manager
sudo systemctl stop proxy-manager
tar xzf backup-20240101.tar.gz
sudo systemctl start proxy-manager
```

## Gỡ Cài Đặt

```bash
# Dừng dịch vụ
sudo systemctl stop proxy-manager
sudo systemctl disable proxy-manager

# Xóa thư mục
sudo rm -rf /opt/proxy-manager
sudo rm /etc/systemd/system/proxy-manager.service
sudo systemctl daemon-reload

# Xóa Node.js (nếu chỉ dùng cho ứng dụng này)
sudo apt-get remove nodejs -y
```

## Tham Khảo

- **wireproxy**: https://github.com/pufferffish/wireproxy
- **WireGuard**: https://www.wireguard.com/
- **Node.js**: https://nodejs.org/

## Hỗ Trợ

Kiểm tra logs:
```bash
sudo journalctl -u proxy-manager -n 500
sudo tail -f /opt/proxy-manager/logs/*.log
```

Kiểm tra quy trình:
```bash
ps aux | grep wireproxy
ps aux | grep node
```

Kiểm tra cổng:
```bash
sudo ss -tlnp | grep -E LISTEN
```

## License

MIT

---

**Ghi chú**: Đây là phiên bản Node.js được viết lại từ bản Python gốc. Tất cả tính năng chính đều được giữ nguyên và tương thích hoàn toàn với bản Python.
