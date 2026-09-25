#!/bin/bash

# VPN to Proxy Manager - Installation Script for Ubuntu VPS

set -e

echo "==========================================="
echo "VPN to Proxy Manager - Installation Script"
echo "==========================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root"
   exit 1
fi

# Update system
echo "[1/8] Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Node.js
echo "[2/8] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install WireGuard
echo "[3/8] Installing WireGuard..."
apt-get install -y wireguard wireguard-tools

# Install OpenVPN (optional)
echo "[4/8] Installing OpenVPN..."
apt-get install -y openvpn openvpn-auth-oauth2

# Install curl for IP checking
echo "[5/8] Installing curl..."
apt-get install -y curl wget

# Install PM2 for process management
echo "[6/8] Installing PM2..."
npm install -g pm2

# Create application directory
echo "[7/8] Setting up application directory..."
APP_DIR="/opt/vpn-to-proxy"
mkdir -p $APP_DIR
cd $APP_DIR

# Create directories for logs and configs
mkdir -p /var/log/vpn-to-proxy
mkdir -p /etc/vpn-to-proxy
mkdir -p /var/lib/vpn-to-proxy

# Set permissions
chmod 755 /var/log/vpn-to-proxy
chmod 755 /var/lib/vpn-to-proxy

# Create systemd service
echo "[8/8] Creating systemd service..."
cat > /etc/systemd/system/vpn-to-proxy.service << 'EOF'
[Unit]
Description=VPN to Proxy Manager
After=network.target

[Service]
Type=simple
User=vpnproxy
WorkingDirectory=/opt/vpn-to-proxy
ExecStart=/usr/bin/node /opt/vpn-to-proxy/src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Environment variables
EnvironmentFile=/etc/vpn-to-proxy/.env

# Capabilities for network operations
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

# Create system user
echo "Creating system user..."
useradd -r -M -s /sbin/nologin vpnproxy || true

# Copy application files
echo "Copying application files..."
cp -r . $APP_DIR/ || true

# Install dependencies
echo "Installing Node.js dependencies..."
cd $APP_DIR
npm install --production

# Create .env file from example
if [ ! -f /etc/vpn-to-proxy/.env ]; then
    cp $APP_DIR/.env.example /etc/vpn-to-proxy/.env
    echo ""
    echo "⚠️  Please configure /etc/vpn-to-proxy/.env with your credentials:"
    echo "   - SURFSHARK_USER: Your Surfshark username"
    echo "   - SURFSHARK_PASS: Your Surfshark password"
    echo "   - API_KEY: A random API key for authentication"
fi

# Set permissions
chown -R vpnproxy:vpnproxy /var/log/vpn-to-proxy
chown -R vpnproxy:vpnproxy /var/lib/vpn-to-proxy
chown vpnproxy:vpnproxy /etc/vpn-to-proxy/.env
chmod 600 /etc/vpn-to-proxy/.env

# Reload systemd
systemctl daemon-reload

echo ""
echo "==========================================="
echo "✅ Installation completed successfully!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "1. Edit configuration: sudo nano /etc/vpn-to-proxy/.env"
echo "2. Add your Surfshark credentials"
echo "3. Start the service: sudo systemctl start vpn-to-proxy"
echo "4. Enable auto-start: sudo systemctl enable vpn-to-proxy"
echo "5. Check status: sudo systemctl status vpn-to-proxy"
echo "6. View logs: sudo journalctl -u vpn-to-proxy -f"
echo ""
echo "Web UI will be available at: http://YOUR_VPS_IP:3000"
echo "SOCKS5 proxy: YOUR_VPS_IP:1080"
echo "HTTP proxy: YOUR_VPS_IP:8888"
echo ""
