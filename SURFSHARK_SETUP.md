# 🔒 Surfshark Configuration Guide

## 📋 Lấy Credentials Surfshark

### 1. Đăng ký Tài Khoản Surfshark

1. Truy cập https://surfshark.com
2. Chọn plan tháng hoặc năm (khuyến nghị 2 năm - rẻ nhất)
3. Hoàn thành thanh toán
4. Xác nhận email

### 2. Lấy OpenVPN Credentials

#### Từ Dashboard Surfshark:

1. Đăng nhập: https://my.surfshark.com
2. Chuyển đến: **Account** → **VPN Credentials**
3. Tìm **OpenVPN Credentials**:
   - **Username**: VPN account username
   - **Password**: VPN account password
4. Lưu các thông tin này vào `.env`:

```env
SURFSHARK_USER=your_username
SURFSHARK_PASS=your_password
```

### 3. Lấy WireGuard Public Key

#### Phương Pháp 1: Từ Surfshark Account

1. Truy cập: https://my.surfshark.com
2. **Account** → **VPN Credentials**
3. Tìm **WireGuard Public Keys**
4. Click **+ Add WireGuard Key** (nếu cần tạo mới)
5. Lưu:
   - Public Key
   - IPV4 Address
   - IPV6 Address (nếu có)

#### Phương Pháp 2: Tạo WireGuard Key Mới

```bash
# Tạo private key
wg genkey | tee privatekey | wg pubkey > publickey

# Lấy public key
cat publickey

# Copy private key
cat privatekey
```

Sau đó upload public key lên Surfshark account.

### 4. Lấy Server Endpoints

#### OpenVPN Server List:

Truy cập: https://api.surfshark.com/v4/server/list/json

Hoặc từ terminal:

```bash
curl https://api.surfshark.com/v4/server/list/json | jq '.[] | select(.country == "United States") | .domain' | head -10
```

#### Định Dạng OpenVPN Config:

```
us-dal.prod.surfshark.com:1194
gb-lon.prod.surfshark.com:1194
fr-par.prod.surfshark.com:1194
```

#### WireGuard Server List:

```bash
curl https://api.surfshark.com/v4/server/list/json | jq '.[] | select(.features | contains(["wg"])) | .domain'
```

---

## 🔑 Cấu Hình WireGuard

### Option 1: Automatic Setup

```bash
sudo bash scripts/setup-wireguard.sh
```

### Option 2: Manual Setup

#### 1. Tạo WireGuard config

```bash
sudo nano /etc/wireguard/surfshark.conf
```

```ini
[Interface]
PrivateKey = YOUR_PRIVATE_KEY_HERE
Address = 10.0.0.2/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = c2VPQZD2CjZZlPqj6GnJ+P2p75rKp7ZrN72hXkKwm1o=
Endpoint = us-nyc.prod.surfshark.com:51820
AllowedIPs = 0.0.0.0/0
PersistentKeepalive = 25
```

Thay thế:
- `YOUR_PRIVATE_KEY_HERE`: Khóa private của bạn
- `PublicKey`: Surfshark public key (lấy từ account)
- `Endpoint`: Surfshark server endpoint

#### 2. Set permissions

```bash
sudo chmod 600 /etc/wireguard/surfshark.conf
```

#### 3. Activate

```bash
# Start WireGuard
sudo wg-quick up surfshark

# Check status
sudo wg show

# View connection
ip addr show wg0
```

#### 4. Test connection

```bash
curl https://api.ipify.org
# Should return: Surfshark server IP
```

---

## 🔐 Cấu Hình OpenVPN

### 1. Tạo OpenVPN config file

```bash
sudo mkdir -p /etc/openvpn/client
sudo nano /etc/openvpn/client/surfshark.ovpn
```

### 2. Minimal OpenVPN config:

```
client
proto tcp
remote us-dal.prod.surfshark.com 1194
cipher AES-256-CBC
auth SHA256
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
verb 3
mute 20
auth-user-pass /etc/openvpn/client/credentials.txt

<ca>
-----BEGIN CERTIFICATE-----
[Surfshark CA Certificate - copy từ OpenVPN config file họ cung cấp]
-----END CERTIFICATE-----
</ca>

<tls-crypt>
-----BEGIN OpenVPN Static key V1-----
[Surfshark TLS key - copy từ OpenVPN config file họ cung cấp]
-----END OpenVPN Static key V1-----
</tls-crypt>
```

### 3. Tạo credentials file

```bash
sudo nano /etc/openvpn/client/credentials.txt
```

```
your_username
your_password
```

```bash
sudo chmod 600 /etc/openvpn/client/credentials.txt
```

### 4. Khởi động OpenVPN

```bash
# Start
sudo systemctl start openvpn@client-surfshark

# Enable auto-start
sudo systemctl enable openvpn@client-surfshark

# Check status
sudo systemctl status openvpn@client-surfshark

# View logs
sudo tail -f /var/log/openvpn/surfshark.log
```

### 5. Test connection

```bash
curl https://api.ipify.org
```

---

## 🔄 Rotating IPs Strategy

### 1. Manual Rotation

```bash
# Qua Web UI: Click "Rotate IP" button

# Qua API:
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/vpn/rotate
```

### 2. Auto Rotation

Cấu hình `.env`:

```env
# Automatic rotation mỗi 30 phút
AUTO_ROTATE=true
ROTATE_INTERVAL_MINUTES=30

# Tự động rotate nếu VPN disconnect
ROTATE_ON_CONNECTION_FAIL=true
```

### 3. Rotating IPs từ Surfshark

Surfshark hỗ trợ 2 cách:

#### A. Multihop (P2P)

Kết nối qua 2 servers:
```
Client → Server A (Country 1) → Server B (Country 2) → Internet
```

**Enabled trong config:**
```
[Peer]
# Use Multihop endpoint
Endpoint = us-dal-p2p.prod.surfshark.com:51820
```

#### B. Manual Server Switching

```bash
# Change location
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:3000/api/vpn/location/gb-lon
```

### 4. Static IP (Add-on)

Nếu mua Static IP add-on từ Surfshark:

```env
# Config trong .env
VPN_LOCATION=us-nyc-static
```

---

## 🧪 Testing & Verification

### 1. Check Current IP

```bash
curl https://api.ipify.org
curl https://api.ipify.org?format=json | jq
```

### 2. Check IP Location

```bash
curl https://ipapi.co/json/
```

### 3. Verify DNS Leaks

```bash
# Test DNS leaks
nslookup whoami.akamai.net
nslookup whoami.cloudflare.com
```

### 4. Verify WebRTC Leak

```bash
# Check WebRTC IPs
echo "var pc = new RTCPeerConnection({iceServers: [{urls: 'stun:stun.l.google.com:19302'}]});
pc.createDataChannel('');
pc.createOffer(function(offer) {pc.setLocalDescription(offer)}, function() {});
pc.onicecandidate = function(ice){
  if(!ice || !ice.candidate) return;
  var ipRegex = /([0-9]{1,3}(\.[0-9]{1,3}){3})/;
  var ipAddress = ipRegex.exec(ice.candidate.candidate)[1];
  console.log('Local IP:', ipAddress);
};" | node
```

---

## 🌍 Available Server Locations

### WireGuard Servers:

```
🇺🇸 US: us-nyc, us-la, us-chi, us-dal, us-sv
🇬🇧 UK: gb-lon, gb-man
🇫🇷 FR: fr-par, fr-mrs
🇩🇪 DE: de-ber, de-mun
🇳🇱 NL: nl-ams, nl-rot
🇸🇪 SE: se-sto
🇨🇭 CH: ch-zrh
🇯🇵 JP: jp-tok, jp-osk
🇸🇬 SG: sg-sgp
🇦🇺 AU: au-syd
🇨🇦 CA: ca-tor, ca-van
🇲🇽 MX: mx-cdmx
🇧🇷 BR: br-sao, br-rio
```

### OpenVPN Servers:

```
Same as WireGuard + more options
```

Lấy full list:

```bash
curl https://api.surfshark.com/v4/server/list/json | jq '.[] | .country + ": " + .domain' | sort | uniq
```

---

## 🔧 Troubleshooting

### WireGuard không kết nối

```bash
# Check service
sudo systemctl status wg-quick@surfshark

# View logs
sudo journalctl -u wg-quick@surfshark -f

# Manual debug
sudo wg-quick down surfshark
sudo wg-quick up surfshark -v
```

### OpenVPN không kết nối

```bash
# Check logs
sudo tail -100 /var/log/openvpn/surfshark.log

# Test config
sudo openvpn --config /etc/openvpn/client/surfshark.ovpn --auth-user-pass /etc/openvpn/client/credentials.txt

# Check ports
sudo netstat -tlnp | grep 1194
```

### No Internet after VPN connect

```bash
# Check routing
ip route show

# Reset default gateway
ip route add default via <your-gateway-ip>

# Or use Surfshark's DNS
echo "nameserver 1.1.1.1" | sudo tee /etc/resolv.conf
```

### Cannot detect Surfshark server

```bash
# Check Surfshark API
curl https://api.surfshark.com/v4/server/list/json | jq '. | length'

# Test specific server
ping us-nyc.prod.surfshark.com
```

---

## 📚 Resources

- 📖 [Surfshark Documentation](https://support.surfshark.com/)
- 🔑 [WireGuard Documentation](https://www.wireguard.com/quickstart/)
- 🔐 [OpenVPN Documentation](https://openvpn.net/community-resources/)
- 🌐 [API Documentation](https://api.surfshark.com/v4/server/list/json)

---

**Last Updated**: 2024
