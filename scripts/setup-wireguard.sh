#!/bin/bash

# Setup WireGuard for Surfshark

set -e

echo "==========================================="
echo "WireGuard Setup for Surfshark"
echo "==========================================="

if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root"
   exit 1
fi

# Install WireGuard
echo "[1/5] Installing WireGuard..."
apt-get update
apt-get install -y wireguard wireguard-tools

# Create WireGuard config directory
echo "[2/5] Creating configuration directory..."
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

# Generate private key
echo "[3/5] Generating WireGuard private key..."
PRIVATE_KEY=$(wg genkey)
PUBLIC_KEY=$(echo $PRIVATE_KEY | wg pubkey)

echo "Private Key: $PRIVATE_KEY"
echo "Public Key: $PUBLIC_KEY"

# Create config file
echo "[4/5] Creating WireGuard configuration..."
cat > /etc/wireguard/surfshark.conf << EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = 10.0.0.2/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = <SURFSHARK_PUBLIC_KEY>
AllowedIPs = 0.0.0.0/0
Endpoint = <SURFSHARK_ENDPOINT>:51820
PersistentKeepalive = 25
EOF

chmod 600 /etc/wireguard/surfshark.conf

echo "[5/5] Setup complete!"
echo ""
echo "⚠️  Important: Replace the placeholders in /etc/wireguard/surfshark.conf"
echo "   - <SURFSHARK_PUBLIC_KEY>: Get from Surfshark account"
echo "   - <SURFSHARK_ENDPOINT>: Surfshark server endpoint"
echo ""
echo "Then enable the interface:"
echo "  sudo wg-quick up surfshark"
echo ""
