#!/bin/bash

# WireGuard Setup Script for Vernie's POS System
# This script sets up a basic WireGuard configuration for testing

set -e

echo "🔧 Setting up WireGuard for Vernie's POS System..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Install WireGuard if not installed
if ! command -v wg &> /dev/null; then
    echo "📦 Installing WireGuard..."
    apt update
    apt install -y wireguard
fi

# Create configuration directory
mkdir -p /etc/wireguard
cd /etc/wireguard

# Generate server keys
echo "🔑 Generating server keys..."
wg genkey | tee private.key
wg pubkey < private.key > public.key
chmod 600 private.key

# Create server configuration
echo "📝 Creating server configuration..."
cat > wg0.conf << EOF
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = $(cat private.key)
SaveConfig = true

[Peer]
# Branch 1
PublicKey = $(cat /tmp/branch1_public.key 2>/dev/null || echo "<BRANCH1_PUBLIC_KEY>")
AllowedIPs = 10.0.0.2/32

[Peer]
# Branch 2  
PublicKey = $(cat /tmp/branch2_public.key 2>/dev/null || echo "<BRANCH2_PUBLIC_KEY>")
AllowedIPs = 10.0.0.3/32

[Peer]
# Branch 3
PublicKey = $(cat /tmp/branch3_public.key 2>/dev/null || echo "<BRANCH3_PUBLIC_KEY>")
AllowedIPs = 10.0.0.4/32
EOF

# Enable IP forwarding
echo "🌐 Enabling IP forwarding..."
echo "net.ipv4.ip_forward=1" > /etc/sysctl.d/99-wireguard.conf
sysctl -p

# Configure firewall
echo "🔥 Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 51820/udp
    ufw allow WireGuard
fi

# Start WireGuard
echo "🚀 Starting WireGuard..."
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

# Show status
echo "📊 WireGuard Status:"
wg show

echo ""
echo "✅ WireGuard setup complete!"
echo ""
echo "📋 Server Configuration:"
echo "   Private Key: $(cat private.key)"
echo "   Public Key: $(cat public.key)"
echo "   Listen Port: 51820"
echo "   VPN Network: 10.0.0.0/24"
echo ""
echo "🔧 To add branches:"
echo "   1. Generate client keys on each branch system"
echo "   2. Add public keys to this server config"
echo "   3. Configure clients to connect to $(hostname -I | awk '{print $1}'):51820"
echo ""
echo "📱 Client Configuration Template:"
echo "   [Interface]"
echo "   Address = 10.0.0.X/24"
echo "   PrivateKey = <CLIENT_PRIVATE_KEY>"
echo "   DNS = 10.0.0.1"
echo ""
echo "   [Peer]"
echo "   PublicKey = $(cat public.key)"
echo "   AllowedIPs = 10.0.0.0/24"
echo "   Endpoint = $(hostname -I | awk '{print $1}'):51820"
echo "   PersistentKeepalive = 25"