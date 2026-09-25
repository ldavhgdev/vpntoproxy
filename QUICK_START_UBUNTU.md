# Hướng Dẫn Nhanh - Proxy Manager Node.js trên Ubuntu VPS

**Thời gian**: ~5 phút (không tính tải wireproxy)

## Bước 1: Chuẩn Bị

Trên VPS Ubuntu, mở terminal và chạy:

```bash
sudo bash -c 'apt-get update && apt-get install -y curl'
```

## Bước 2: Tải Setup Script

```bash
curl -fsSL https://your-domain.com/ubuntu-nodejs-setup.sh -o /tmp/setup.sh
chmod +x /tmp/setup.sh
```

Hoặc copy file `ubuntu-nodejs-setup.sh` vào VPS:
```bash
scp ubuntu-nodejs-setup.sh user@vps:/tmp/
ssh user@vps
chmod +x /tmp/ubuntu-nodejs-setup.sh
```

## Bước 3: Chạy Setup

```bash
sudo /tmp/ubuntu-nodejs-setup.sh
```

Script sẽ:
- ✅ Cập nhật hệ thống
- ✅ Cài đặt Node.js 20
- ✅ Tải wireproxy
- ✅ Tạo thư mục cần thiết
- ✅ Cấu hình systemd service

**Thời gian chờ**: ~2-5 phút (tuỳ tốc độ mạng)

## Bước 4: Cấu Hình App

Sau setup script hoàn tất:

```bash
cd /opt/proxy-manager

# Copy app.js
sudo wget https://your-domain.com/nodejs-app.js
# Hoặc copy file local:
# scp nodejs-app.js user@vps:/opt/proxy-manager/app.js

# Tạo thư mục web
sudo mkdir -p web

# Copy web UI
sudo wget https://your-domain.com/nodejs-web-ui.html -O web/index.html
# Hoặc copy file local

# Cấp quyền
sudo chown -R root:root /opt/proxy-manager
sudo chmod 755 /opt/proxy-manager/app.js
```

## Bước 5: Khởi Động

```bash
# Bật dịch vụ
sudo systemctl start proxy-manager

# Kiểm tra trạng thái
sudo systemctl status proxy-manager

# Bật tự khởi động
sudo systemctl enable proxy-manager
```

## Bước 6: Truy Cập Web UI

Mở trình duyệt:

```
http://VPS_IP:8686
```

(Thay `VPS_IP` bằng địa chỉ IP hoặc domain của VPS)

## Bước 7: Nạp File Config WireGuard

1. Trên Surfshark/NordVPN:
   - Vào "Cài đặt thủ công" → WireGuard
   - Tạo cặp khóa
   - Tải file `.conf` của các server bạn cần (ít nhất 1 file)

2. Trên Web UI:
   - Bấm "Nạp file .conf"
   - Kéo thả các file `.conf` vào, hoặc bấm để chọn file
   - Nếu muốn tự động tạo tunnel:
     - ✅ Tick "Tạo luôn mỗi file thành 1 tunnel riêng và bật ngay"
   - Bấm "Đóng"

## Bước 8: Tạo Tunnel (nếu chưa tự động)

1. Bấm "Tạo tunnel"
2. Điền:
   - **Tên**: VN Server 1 (tùy ý)
   - **Vị trí**: Chọn 1-2 file .conf
   - **Cổng SOCKS5/HTTP**: Để trống (tự chọn)
   - **Lắng nghe**: 127.0.0.1 (hoặc 0.0.0.0 nếu dùng từ máy khác)
3. Bấm "Tạo tunnel"

## Bước 9: Sử Dụng Proxy

Khi tunnel sáng LED xanh = đang chạy ✅

**Lấy proxy string**:
- Bấm vào dòng SOCKS5/HTTP để copy
- Hoặc bấm "Xuất cho GPM Login" để lấy danh sách

**Định dạng proxy**:
```
127.0.0.1:20001        (host:port)
socks5://127.0.0.1:20001  (socks5://host:port)
```

## Kiểm Tra Hoạt Động

### Xem logs

```bash
sudo journalctl -u proxy-manager -f
```

Hoặc:

```bash
sudo tail -f /opt/proxy-manager/logs/*.log
```

### Test proxy

```bash
# SOCKS5
curl -x socks5://127.0.0.1:20001 http://httpbin.org/ip

# HTTP
curl -x http://127.0.0.1:30001 http://httpbin.org/ip
```

Nếu thấy IP trả về ≠ IP thực → proxy chạy OK ✅

### Kiểm tra cổng

```bash
sudo ss -tlnp | grep -E ':(8686|2000[0-9])'
```

Sẽ hiển thị:
- `8686` - Web UI
- `2000X` - SOCKS5 proxies
- `3000X` - HTTP proxies

## Dừng/Khởi Động Lại

```bash
# Dừng
sudo systemctl stop proxy-manager

# Khởi động lại
sudo systemctl restart proxy-manager

# Bật/tắt auto-start
sudo systemctl enable proxy-manager   # Bật auto-start
sudo systemctl disable proxy-manager  # Tắt auto-start
```

## Cách Sửa Port/Config

### Sửa qua Web UI

Cài đặt → Điền giá trị mới → Lưu cài đặt

*(Một số cài đặt cần khởi động lại sau khi lưu)*

### Sửa qua .env file

```bash
sudo nano /opt/proxy-manager/.env
```

Chỉnh sửa, lưu (Ctrl+X, Y, Enter), rồi:

```bash
sudo systemctl restart proxy-manager
```

## Lỗi Phổ Biến

### ❌ "Cannot find wireproxy"

Wireproxy chưa tải. Chạy:
```bash
cd /opt/proxy-manager/bin
curl -fsSL https://github.com/pufferffish/wireproxy/releases/latest/download/wireproxy_linux_amd64.tar.gz | tar xz wireproxy
chmod +x wireproxy
sudo systemctl restart proxy-manager
```

### ❌ "Port already in use"

Port bị chiếm. Chọn port khác hoặc tìm process chiếm:
```bash
sudo ss -tlnp | grep :8686
```

### ❌ Tunnel LED đỏ (lỗi)

Xem logs:
```bash
sudo journalctl -u proxy-manager -f
tail -f /opt/proxy-manager/logs/tunnel_id.log
```

### ❌ Web UI không truy cập được

- Firewall: `sudo ufw allow 8686/tcp`
- Kiểm tra service: `sudo systemctl status proxy-manager`
- Logs: `sudo journalctl -u proxy-manager -n 50`

## Tối Ưu Hóa

### Tăng số tunnel

```bash
# Sửa .env
SOCKS_BASE_PORT=19000   # Từ 19000 đến 65000
HTTP_BASE_PORT=30000    # Từ 30000 đến 65000
```

Khởi động lại.

### Tắt auto-check (tiết kiệm)

Cài đặt → "Kiểm tra kết nối mỗi" → `0` (0 = tắt)

### Giảm log size

```bash
sudo rm /opt/proxy-manager/logs/*.log
sudo systemctl restart proxy-manager
```

## Tiếp Theo

Sau khi setup thành công:

1. **Cấu hình firewall** (nếu dùng từ máy khác):
   ```bash
   sudo ufw allow 20001:20100/tcp  # SOCKS5 ports
   sudo ufw allow 30001:30100/tcp  # HTTP ports
   ```

2. **Đặt mật khẩu Web UI** (nếu dùng LAN):
   - Cài đặt → Mật khẩu Web UI → Đặt pass → Lưu

3. **Backup config**:
   ```bash
   tar czf proxy-backup.tar.gz /opt/proxy-manager/configs /opt/proxy-manager/data
   ```

4. **Tìm hiểu API**:
   - Xem file `ubuntu-nodejs-README.md` → phần "API Endpoints"

---

✅ **Hoàn tất!** Giờ bạn có proxy pool chạy trên VPS.

Có vấn đề? Xem logs và troubleshooting trong `ubuntu-nodejs-README.md`.
