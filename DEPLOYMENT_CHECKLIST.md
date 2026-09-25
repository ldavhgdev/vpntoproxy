# Deployment Checklist - Proxy Manager Node.js

Checklist triển khai Proxy Manager trên Ubuntu VPS.

---

## 📋 Pre-Deployment (Chuẩn Bị)

- [ ] Ubuntu 18.04 LTS hoặc mới hơn
- [ ] Quyền root/sudo access
- [ ] Kết nối SSH vào VPS
- [ ] Tối thiểu 1 GB RAM free
- [ ] Tối thiểu 500 MB disk space
- [ ] Kết nối internet ổn định

---

## 🚀 Installation Steps

### Step 1: Prepare Server

```bash
[ ] SSH vào VPS
    ssh user@vps_ip

[ ] Cập nhật hệ thống
    sudo apt-get update && sudo apt-get upgrade -y

[ ] Kiểm tra phiên bản Ubuntu
    lsb_release -a
    # Cần ≥ 18.04

[ ] Kiểm tra network
    ping google.com
    # Phải có internet
```

### Step 2: Download Setup Script

```bash
[ ] Tải setup script
    # Cách 1: Từ URL
    curl -fsSL https://your-domain/ubuntu-nodejs-setup.sh -o /tmp/setup.sh
    
    # Cách 2: SCP từ máy local
    scp ubuntu-nodejs-setup.sh user@vps:/tmp/

[ ] Cấp quyền thực thi
    chmod +x /tmp/setup.sh

[ ] Kiểm tra script (tùy chọn)
    head -20 /tmp/setup.sh
```

### Step 3: Run Setup Script

```bash
[ ] Chạy setup
    sudo /tmp/setup.sh
    
    # Theo dõi output:
    # - ✓ System updated
    # - ✓ Dependencies installed
    # - ✓ Node.js X.X.X installed
    # - ✓ wireproxy downloaded
    # - ✓ Directories created
    # - ✓ npm modules installed
    # - ✓ systemd service created
    
    # Thời gian: ~2-5 phút

[ ] Kiểm tra setup thành công
    ls -la /opt/proxy-manager/
    # Phải có: app.js, package.json, .env, configs/, logs/, bin/
```

### Step 4: Copy Application Files

```bash
[ ] Copy app.js (nếu setup script chưa copy)
    # Cách 1: Từ URL
    sudo curl -fsSL https://your-domain/nodejs-app.js -o /opt/proxy-manager/app.js
    
    # Cách 2: Từ local
    scp nodejs-app.js user@vps:/opt/proxy-manager/

[ ] Tạo thư mục web
    sudo mkdir -p /opt/proxy-manager/web

[ ] Copy Web UI
    # Cách 1: Từ URL
    sudo curl -fsSL https://your-domain/nodejs-web-ui.html -o /opt/proxy-manager/web/index.html
    
    # Cách 2: Từ local
    scp nodejs-web-ui.html user@vps:/opt/proxy-manager/web/index.html

[ ] Kiểm tra files
    ls -la /opt/proxy-manager/app.js
    ls -la /opt/proxy-manager/web/index.html
    # Cả hai phải tồn tại
```

### Step 5: Configure Environment

```bash
[ ] Kiểm tra .env (được tạo bởi setup script)
    cat /opt/proxy-manager/.env

[ ] Sửa .env nếu cần
    sudo nano /opt/proxy-manager/.env
    
    # Chỉnh sửa các giá trị:
    # - APP_HOST: 127.0.0.1 (local) hoặc 0.0.0.0 (LAN)
    # - APP_PORT: 8686 (hoặc port khác)
    # - SOCKS_BASE_PORT: 20001
    # - HTTP_BASE_PORT: 30001
    
    # Lưu: Ctrl+X → Y → Enter

[ ] Kiểm tra permissions
    ls -la /opt/proxy-manager/.env
    # Phải là rw------- (600)
```

### Step 6: Start Service

```bash
[ ] Khởi động dịch vụ
    sudo systemctl start proxy-manager

[ ] Kiểm tra status
    sudo systemctl status proxy-manager
    # Phải là "active (running)"

[ ] Bật auto-start
    sudo systemctl enable proxy-manager

[ ] Kiểm tra process
    ps aux | grep wireproxy
    # Phải thấy: node app.js
```

### Step 7: Verify Installation

```bash
[ ] Kiểm tra logs
    sudo journalctl -u proxy-manager -n 20
    # Tìm: "Web UI running at"

[ ] Kiểm tra cổng
    sudo ss -tlnp | grep 8686
    # Phải thấy: LISTEN ... 8686
    
    sudo ss -tlnp | grep 2000[0-9]
    # Có thể thấy các SOCKS ports

[ ] Test Web UI access
    curl -s http://127.0.0.1:8686/ | head -20
    # Phải trả về HTML

[ ] Kiểm tra directories
    ls -la /opt/proxy-manager/{configs,logs,runtime,data,bin}
    # Tất cả phải tồn tại
    
    ls -la /opt/proxy-manager/bin/wireproxy
    # Phải executable
```

### Step 8: Access Web UI

```bash
[ ] Mở trình duyệt
    http://VPS_IP:8686
    # Hoặc nếu có domain:
    # http://your-domain:8686

[ ] Kiểm tra Web UI load
    - Header: "Surf Proxy Manager" ✓
    - Button "Nạp file .conf" ✓
    - Button "Tạo tunnel" ✓
    - Tab "Tunnel" & "File cấu hình" ✓

[ ] Nếu Web UI không load
    - Kiểm tra firewall: sudo ufw status
    - Kiểm tra port: sudo lsof -i :8686
    - Kiểm tra logs: sudo journalctl -u proxy-manager -f
```

---

## 🔐 Security Configuration

```bash
[ ] Cài đặt firewall (UFW)
    sudo ufw enable
    
    # Cho phép SSH
    sudo ufw allow 22/tcp
    
    # Cho phép Web UI
    sudo ufw allow 8686/tcp
    
    # Cho phép proxy ports
    sudo ufw allow 20001:20100/tcp
    sudo ufw allow 30001:30100/tcp

[ ] Kiểm tra UFW rules
    sudo ufw status
    # Phải thấy các rules trên

[ ] Đặt Web UI password (nếu dùng 0.0.0.0)
    # Web UI → Cài đặt → Mật khẩu Web UI → Đặt password → Lưu
    
    # Hoặc chỉnh .env:
    # APP_PASSWORD=your_secure_password
    # sudo systemctl restart proxy-manager

[ ] Hạn chế SSH access
    # Chỉ cho phép từ IP cụ thể (tùy chọn)
    # sudo ufw allow from 203.0.113.1 to any port 22
```

---

## 📦 WireGuard Configuration

```bash
[ ] Chuẩn bị file WireGuard
    - Đăng nhập Surfshark/NordVPN/VPN provider
    - Tìm: VPN Settings → Manual Setup → WireGuard
    - Tạo Key Pair
    - Download .conf file (ít nhất 1)
    - Lưu về máy local

[ ] Upload config files
    # Web UI → Nạp file .conf
    # - Kéo thả các file .conf vào
    # - Hoặc bấm để chọn file
    # - Tick "Tạo luôn mỗi file thành 1 tunnel"
    # - Bấm "Đóng"
    # - Chờ ~10 giây

[ ] Kiểm tra files được upload
    ls -la /opt/proxy-manager/configs/
    # Phải thấy các .conf files
```

---

## 🔌 Test Tunnels

```bash
[ ] Tạo tunnel đầu tiên
    # Web UI → "Tạo tunnel"
    # - Chọn 1 hoặc nhiều .conf files
    # - Cổng SOCKS5: để trống (auto)
    # - Cổng HTTP: để trống (auto)
    # - Bấm "Tạo tunnel"

[ ] Kiểm tra tunnel status
    # LED phải chuyển từ:
    # - Gray (stopped) → Yellow (starting) → Green (online)
    # - Mất ~3-10 giây

[ ] Nếu LED đỏ (error)
    # - Bấm icon "Nhật ký"
    # - Xem error message
    # - Kiểm tra logs: sudo tail -f /opt/proxy-manager/logs/*.log

[ ] Test proxy (nếu online)
    # Từ VPS:
    curl -x socks5://127.0.0.1:20001 http://httpbin.org/ip
    
    # Kết quả phải khác IP VPS → proxy chạy OK ✓
```

---

## 📊 Performance Check

```bash
[ ] Kiểm tra CPU/Memory
    top
    # Node process: < 50% CPU, < 100 MB RAM
    
    free -h
    # Available memory > 500 MB

[ ] Kiểm tra disk space
    df -h /
    # Available > 1 GB

[ ] Kiểm tra network
    ping 8.8.8.8
    # Response OK < 100ms
```

---

## 📝 Documentation

```bash
[ ] Copy README files
    scp ubuntu-nodejs-README.md user@vps:/opt/proxy-manager/
    scp QUICK_START_UBUNTU.md user@vps:/opt/proxy-manager/

[ ] Tạo server info file
    cat > /opt/proxy-manager/SERVER_INFO.txt << EOF
    Web UI: http://VPS_IP:8686
    SSH: ssh user@VPS_IP
    
    Cơ bản:
    - Bật tunnels: Web UI hoặc systemctl
    - Xem logs: journalctl -u proxy-manager -f
    - Khởi động lại: systemctl restart proxy-manager
    - Tắt: systemctl stop proxy-manager
    EOF
```

---

## 🔄 Backup & Restore

```bash
[ ] Tạo backup đầu tiên
    tar czf /tmp/proxy-backup-$(date +%Y%m%d).tar.gz \
      /opt/proxy-manager/{configs,data,.env}
    
    # Lưu file này đến nơi an toàn

[ ] Test restore (tùy chọn)
    # Kiểm tra backup có thể extract
    tar tzf /tmp/proxy-backup-*.tar.gz | head -20
```

---

## 📞 Post-Deployment

```bash
[ ] Document setup
    echo "Setup date: $(date)" > /opt/proxy-manager/SETUP_DATE.txt
    echo "Admin contact: your@email.com" >> /opt/proxy-manager/SETUP_DATE.txt

[ ] Set up monitoring (tùy chọn)
    # Ví dụ: crontab check service
    # 0 * * * * systemctl is-active proxy-manager || systemctl start proxy-manager

[ ] Test remote access
    # Từ máy khác:
    curl http://VPS_IP:8686/api/state
    # Phải trả về JSON

[ ] Training/Documentation
    - Share QUICK_START_UBUNTU.md với user
    - Giải thích Web UI
    - Hướng dẫn nạp config
    - Hướng dẫn sử dụng proxy
```

---

## ✅ Final Checklist

```bash
[ ] Web UI accessible ✓
[ ] Firewall configured ✓
[ ] Tunnels can be created ✓
[ ] Proxy working (test curl) ✓
[ ] Logs accessible ✓
[ ] Auto-start enabled ✓
[ ] Backup created ✓
[ ] Documentation ready ✓
[ ] All files in place ✓
[ ] systemd service running ✓
```

---

## 🆘 Troubleshooting Quick Links

Nếu có vấn đề:

```
Web UI not loading       → Check firewall, journalctl -u proxy-manager
Port already in use      → sudo lsof -i :8686, change port in .env
Tunnel won't start       → Check .conf file, check logs
Proxy not working        → Test: curl -x socks5://... http://...
High CPU/Memory          → Too many tunnels, reduce or use more powerful VPS
```

---

## 📋 Delivery Checklist

Khi deliver cho client:

```bash
[ ] Thư mục /opt/proxy-manager/ đã setup
[ ] Cấu hình .env hoàn tất
[ ] Web UI accessible & configured
[ ] Ít nhất 1 tunnel test chạy OK
[ ] Firewall rules thích hợp
[ ] Backup created
[ ] Documentation delivered
[ ] Admin password set (nếu LAN)
[ ] Service auto-start enabled
[ ] Logs directory configured
[ ] Client training hoàn tất
```

---

## 📅 Maintenance Schedule

**Daily**: Không cần
**Weekly**: Kiểm tra logs, check disk space
**Monthly**: 
- Update Node.js: `sudo apt update && sudo apt upgrade nodejs`
- Update wireproxy: Download latest từ GitHub
- Cleanup old logs: `rm /opt/proxy-manager/logs/*.old`
**Quarterly**: Review & optimize settings

---

**Setup Duration**: 5-10 minutes (excluding WireGuard config download)
**Difficulty Level**: Medium (basic Linux knowledge needed)
**Support Level**: Production-ready

✅ **Ready to Deploy!**
