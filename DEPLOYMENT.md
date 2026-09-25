# 🚀 Hướng Dẫn Deployment VPN to Proxy Manager

## 📋 Yêu Cầu Tiên Quyết

- **Ubuntu VPS**: 20.04 LTS hoặc cao hơn
- **Tài khoản Surfshark**: Đã active
- **Công khai**: SSH access với quyền sudo
- **Domain** (tùy chọn): Để cấu hình HTTPS

---

## 1️⃣ Chuẩn Bị VPS

### 1.1 Update hệ thống

```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### 1.2 Thiết lập firewall (UFW)

```bash
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw allow 1080/tcp
sudo ufw allow 8888/tcp
sudo ufw status
```

### 1.3 Thiết lập Swap (nếu RAM < 2GB)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 2️⃣ Deployment Phương Pháp 1: Direct Install

### 2.1 Clone repository

```bash
sudo mkdir -p /opt
cd /opt
sudo git clone <your-repo-url> vpn-to-proxy
cd vpn-to-proxy
```

### 2.2 Chạy script cài đặt

```bash
sudo bash scripts/install.sh
```

Script sẽ tự động:
- ✅ Cài Node.js 18
- ✅ Cài WireGuard & OpenVPN
- ✅ Cài PM2
- ✅ Tạo systemd service
- ✅ Cài dependencies

### 2.3 Cấu hình credentials

```bash
sudo nano /etc/vpn-to-proxy/.env
```

Thêm:
```env
SURFSHARK_USER=your_email@example.com
SURFSHARK_PASS=your_password
API_KEY=gen-random-key-$(openssl rand -hex 32)
VPN_LOCATION=us-nyc
```

### 2.4 Khởi động dịch vụ

```bash
# Bắt đầu service
sudo systemctl start vpn-to-proxy

# Kích hoạt auto-start
sudo systemctl enable vpn-to-proxy

# Kiểm tra trạng thái
sudo systemctl status vpn-to-proxy

# Xem logs
sudo journalctl -u vpn-to-proxy -f
```

---

## 3️⃣ Deployment Phương Pháp 2: Docker Compose

### 3.1 Cài Docker

```bash
# Cài Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Thêm user vào docker group
sudo usermod -aG docker $USER
newgrp docker

# Cài Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 3.2 Clone và cấu hình

```bash
sudo mkdir -p /opt/vpn-to-proxy
cd /opt/vpn-to-proxy
sudo git clone <your-repo-url> .
```

### 3.3 Tạo .env file

```bash
sudo nano .env
```

```env
SURFSHARK_USER=your_email@example.com
SURFSHARK_PASS=your_password
API_KEY=your-random-api-key-here
```

### 3.4 Deploy với Docker Compose

```bash
# Build image
sudo docker-compose build

# Khởi động
sudo docker-compose up -d

# Kiểm tra
sudo docker-compose ps
sudo docker-compose logs -f
```

---

## 4️⃣ Cấu Hình Nginx Reverse Proxy (HTTPS)

### 4.1 Cài Nginx

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

### 4.2 Tạo config Nginx

```bash
sudo nano /etc/nginx/sites-available/vpn-proxy
```

```nginx
upstream vpn_proxy_backend {
    server localhost:3000;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name vpn-proxy.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name vpn-proxy.yourdomain.com;

    # SSL certificates (sau khi run certbot)
    ssl_certificate /etc/letsencrypt/live/vpn-proxy.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vpn-proxy.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css text/javascript application/json;
    gzip_min_length 1000;

    location / {
        proxy_pass http://vpn_proxy_backend;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /ws {
        proxy_pass http://vpn_proxy_backend/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

### 4.3 Enable site và test

```bash
sudo ln -s /etc/nginx/sites-available/vpn-proxy /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
```

### 4.4 Cấu hình SSL với Let's Encrypt

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d vpn-proxy.yourdomain.com
```

Hoặc automatic:
```bash
sudo certbot --nginx -d vpn-proxy.yourdomain.com
```

### 4.5 Auto-renew certificates

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Test renewal
sudo certbot renew --dry-run
```

---

## 5️⃣ Port Forwarding (Nếu là Home VPS)

### Cấu hình Router

1. Truy cập Router admin panel
2. Port Forwarding settings:
   - **WAN Port**: 3000 → **LAN IP:3000** (Web UI)
   - **WAN Port**: 1080 → **LAN IP:1080** (SOCKS5)
   - **WAN Port**: 8888 → **LAN IP:8888** (HTTP Proxy)

3. Cấu hình DynDNS (nếu IP động)

---

## 6️⃣ Monitoring & Maintenance

### 6.1 Kiểm tra trạng thái

```bash
# Systemd
sudo systemctl status vpn-to-proxy
sudo journalctl -u vpn-to-proxy -n 50 -f

# Docker
docker-compose ps
docker-compose logs -f

# Check services
netstat -tlnp | grep -E '3000|1080|8888'
```

### 6.2 Backup cấu hình

```bash
# Backup .env
sudo cp /etc/vpn-to-proxy/.env ~/.vpn-proxy-backup.env
sudo chmod 600 ~/.vpn-proxy-backup.env

# Backup logs
sudo tar -czf ~/vpn-proxy-logs-$(date +%Y%m%d).tar.gz /var/log/vpn-to-proxy/
```

### 6.3 Updates

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Update application
cd /opt/vpn-to-proxy
sudo git pull
sudo npm install
sudo systemctl restart vpn-to-proxy
```

### 6.4 Rotate logs

```bash
sudo nano /etc/logrotate.d/vpn-to-proxy
```

```
/var/log/vpn-to-proxy/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 vpnproxy vpnproxy
    sharedscripts
    postrotate
        systemctl reload vpn-to-proxy > /dev/null 2>&1 || true
    endscript
}
```

---

## 7️⃣ Testing & Verification

### 7.1 Test Web UI

```bash
curl -k https://vpn-proxy.yourdomain.com/health
# Response: {"status":"ok","timestamp":"...","uptime":...}
```

### 7.2 Test APIs

```bash
# Set API key
API_KEY="your-random-api-key-here"

# VPN Status
curl -H "Authorization: Bearer $API_KEY" \
  https://vpn-proxy.yourdomain.com/api/vpn/status

# Proxy Status
curl -H "Authorization: Bearer $API_KEY" \
  https://vpn-proxy.yourdomain.com/api/proxy/status
```

### 7.3 Test SOCKS5 Proxy

```bash
# From another machine
curl --socks5 YOURIP:1080 https://api.ipify.org

# Should return: YOURIP (from Surfshark)
```

### 7.4 Test HTTP Proxy

```bash
curl -x http://YOURIP:8888 https://api.ipify.org
```

---

## 8️⃣ Performance Tuning

### 8.1 Node.js optimization

```bash
# Increase file descriptors
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

# Sysctl tuning
sudo sysctl -w net.core.somaxconn=4096
sudo sysctl -w net.ipv4.tcp_max_syn_backlog=4096
```

### 8.2 VPN optimization

```bash
# Enable IP forwarding
echo "net.ipv4.ip_forward = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## 9️⃣ Troubleshooting

### Problem: Service không khởi động

```bash
# Check logs
sudo journalctl -u vpn-to-proxy -n 100

# Manual start để xem error
cd /opt/vpn-to-proxy
node src/index.js
```

### Problem: VPN không kết nối

```bash
# Check WireGuard
sudo wg show

# Check OpenVPN logs
sudo tail -f /var/log/openvpn/surfshark.log

# Restart VPN manager
sudo systemctl restart vpn-to-proxy
```

### Problem: Proxy port bị chiếm

```bash
# Check what's using the ports
sudo lsof -i :1080
sudo lsof -i :8888
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

### Problem: Memory leak

```bash
# Monitor memory
watch -n 1 'free -h'

# Check Node process
ps aux | grep node

# Restart if needed
sudo systemctl restart vpn-to-proxy
```

---

## 🔟 Security Hardening

### 10.1 Firewall rules

```bash
# Chỉ cho phép từ trusted IPs
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow from 192.168.1.0/24 to any port 1080
```

### 10.2 Fail2ban protection

```bash
sudo apt-get install -y fail2ban

# Create jail for web UI
sudo nano /etc/fail2ban/jail.local
```

```
[sshd]
enabled = true
maxretry = 3

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 3
```

### 10.3 System hardening

```bash
# Disable unnecessary services
sudo systemctl disable bluetooth cups

# Set secure SSH config
sudo nano /etc/ssh/sshd_config
# PermitRootLogin no
# PasswordAuthentication no
# MaxAuthTries 3

sudo systemctl restart ssh
```

---

## ✅ Checklist Deployment

- [ ] VPS provisioned dan updated
- [ ] Firewall dikonfigurasi
- [ ] Docker/Node.js installed
- [ ] Repository cloned
- [ ] Credentials di .env
- [ ] Service started dan enabled
- [ ] Web UI accessible
- [ ] APIs working
- [ ] SOCKS5 proxy tested
- [ ] HTTPS configured
- [ ] Monitoring setup
- [ ] Backup configured
- [ ] Logs rotation setup
- [ ] Security hardened

---

## 📞 Support

Nếu gặp vấn đề:
1. Kiểm tra logs: `sudo journalctl -u vpn-to-proxy -f`
2. Verify file permissions
3. Check network connectivity
4. Test individual components

Good luck! 🚀
