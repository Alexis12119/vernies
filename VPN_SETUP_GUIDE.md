# VPN-Based POS System Setup Guide

## Overview
This guide will help you set up a complete VPN-based POS system with offline resilience and centralized control.

## Prerequisites

### System Requirements
- **Central Server**: Linux/Windows with Node.js 18+, MySQL 8.0+
- **Branch Systems**: Linux/Windows with Node.js 18+, MySQL 8.0+
- **Network**: Stable internet connection, VPN capability
- **Hardware**: Minimum 4GB RAM, 50GB storage per system

### Software Requirements
- Node.js 18+ 
- MySQL 8.0+
- WireGuard or OpenVPN
- PM2 (for process management)

## Installation Steps

### 1. Central Server Setup

#### 1.1 Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MySQL
sudo apt install mysql-server -y

# Install PM2
sudo npm install -g pm2

# Install WireGuard
sudo apt install wireguard -y
```

#### 1.2 Configure Database
```bash
# Secure MySQL
sudo mysql_secure_installation

# Create database and user
mysql -u root -p
CREATE DATABASE vernie_pos;
CREATE USER 'vernie_user'@'%' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON vernie_pos.* TO 'vernie_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

#### 1.3 Setup VPN Server
```bash
# Generate server keys
wg genkey | sudo tee /etc/wireguard/private.key
wg pubkey | sudo tee /etc/wireguard/public.key

# Create server config
sudo tee /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = $(sudo cat /etc/wireguard/private.key)
SaveConfig = true

[Peer]
# Branch 1 - Add for each branch
PublicKey = <BRANCH1_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32
EOF

# Enable IP forwarding
echo "net.ipv4.ip_forward=1" | sudo tee /etc/sysctl.d/99-wireguard.conf
sudo sysctl -p

# Start WireGuard
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

#### 1.4 Deploy POS Application
```bash
# Clone repository
git clone <repository-url>
cd vernies/backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with your settings

# Setup database
node setup-database.js
node setup-vpn-schema.js

# Start with PM2
pm2 start index-vpn.js --name "central-server"
pm2 startup
pm2 save
```

### 2. Branch System Setup

#### 2.1 Install Dependencies (Same as Central Server)
```bash
# Follow same installation steps as central server
```

#### 2.2 Configure Local Database
```bash
# Create branch-specific database
mysql -u root -p
CREATE DATABASE branch_1_inventory;
CREATE DATABASE branch_1_transactions;
GRANT ALL PRIVILEGES ON branch_1_*.* TO 'vernie_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

#### 2.3 Setup VPN Client
```bash
# Generate client keys
wg genkey | sudo tee /etc/wireguard/branch1_private.key
wg pubkey | sudo tee /etc/wireguard/branch1_public.key

# Create client config
sudo tee /etc/wireguard/wg0.conf << EOF
[Interface]
Address = 10.0.0.2/24
PrivateKey = $(sudo cat /etc/wireguard/branch1_private.key)
DNS = 10.0.0.1

[Peer]
PublicKey = <SERVER_PUBLIC_KEY>
AllowedIPs = 10.0.0.0/24
Endpoint = central-server.example.com:51820
PersistentKeepalive = 25
EOF

# Start VPN client
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

#### 2.4 Deploy Branch Application
```bash
# Clone repository (same as central)
git clone <repository-url>
cd vernies/backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
nano .env  # Edit with branch-specific settings

# Start with PM2
pm2 start index-vpn.js --name "branch-1"
pm2 startup
pm2 save
```

## Configuration

### Environment Variables

#### Central Server (.env)
```bash
# Database
DB_HOST=localhost
DB_USER=vernie_user
DB_PASSWORD=secure_password
DB_NAME=vernie_pos

# Server
PORT=3001
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# VPN
CENTRAL_SERVER_URL=http://10.0.0.1:3001
VPN_ROLE=central
```

#### Branch System (.env)
```bash
# Database
DB_HOST=localhost
DB_USER=vernie_user
DB_PASSWORD=secure_password
DB_NAME=vernie_pos

# Local Database
LOCAL_DB_HOST=localhost
LOCAL_DB_USER=vernie_user
LOCAL_DB_PASSWORD=secure_password

# Server
PORT=3002
BRANCH_ID=1

# VPN
CENTRAL_SERVER_URL=http://10.0.0.1:3001
VPN_ROLE=branch
```

## Testing

### 1. VPN Connectivity Test
```bash
# From branch system
ping 10.0.0.1
curl http://10.0.0.1:3001/api/health
```

### 2. Service Disruption Test
```bash
# Stop central server
pm2 stop central-server

# Check branch behavior (should stop operations)
curl http://localhost:3002/api/vpn/status

# Restart central server
pm2 start central-server

# Verify recovery
curl http://localhost:3002/api/vpn/status
```

### 3. Transaction Queue Test
```bash
# Disconnect VPN
sudo systemctl stop wg-quick@wg0

# Process transactions (should queue)
# Test via POS interface

# Reconnect VPN
sudo systemctl start wg-quick@wg0

# Verify sync
curl http://localhost:3002/api/vpn/status
```

## Monitoring

### System Health Monitoring
```bash
# Check PM2 status
pm2 status

# Check VPN status
sudo wg show

# Check system logs
pm2 logs central-server
pm2 logs branch-1

# Monitor database
mysql -u vernie_user -p -e "SHOW PROCESSLIST;"
```

### Performance Monitoring
```bash
# Network latency
ping -c 4 10.0.0.1

# VPN throughput
iperf3 -c 10.0.0.1

# Database performance
mysql -u vernie_user -p -e "SHOW ENGINE INNODB STATUS\\G"
```

## Security

### VPN Security
- Use strong private keys (minimum 256-bit)
- Regular key rotation (monthly)
- Enable firewall rules for VPN traffic
- Monitor VPN connection logs

### Database Security
- Use strong passwords
- Enable SSL/TLS connections
- Regular database backups
- Access control and auditing

### Application Security
- Environment variable protection
- JWT token expiration
- Input validation and sanitization
- Regular security updates

## Troubleshooting

### Common Issues

#### VPN Connection Issues
```bash
# Check VPN status
sudo wg show

# Restart VPN
sudo systemctl restart wg-quick@wg0

# Check logs
sudo journalctl -u wg-quick@wg0
```

#### Database Connection Issues
```bash
# Test database connection
mysql -u vernie_user -p -h localhost

# Check MySQL status
sudo systemctl status mysql

# Reset MySQL password
sudo mysql_secure_installation
```

#### Application Issues
```bash
# Check application logs
pm2 logs <app-name>

# Restart application
pm2 restart <app-name>

# Check environment variables
pm2 env <app-name>
```

## Maintenance

### Regular Maintenance Tasks
1. **Daily**: Check VPN connectivity, review logs
2. **Weekly**: Database optimization, backup verification
3. **Monthly**: VPN key rotation, security updates
4. **Quarterly**: Performance tuning, capacity planning

### Backup Procedures
```bash
# Database backup
mysqldump -u vernie_user -p vernie_pos > backup_$(date +%Y%m%d).sql

# Application backup
tar -czf vernies_backup_$(date +%Y%m%d).tar.gz /path/to/vernies

# VPN config backup
sudo cp /etc/wireguard/wg0.conf /backup/wg0_$(date +%Y%m%d).conf
```

## Emergency Procedures

### Central Server Failure
1. All branches automatically stop operations
2. Transactions are queued locally
3. Manual failover can be triggered if needed
4. Recovery is automatic when server returns online

### Branch Internet Failure
1. Ongoing transactions complete locally
2. New transactions are queued
3. Inventory updates are stored locally
4. Automatic sync when connection restored

### Data Recovery
1. Use latest backup if corruption detected
2. Verify data integrity before going live
3. Monitor system for 24 hours after recovery
4. Document all recovery actions

## Support

For technical support:
1. Check logs first
2. Document error messages
3. Provide system configuration
4. Include steps to reproduce issue

Contact: support@vernie-pos.com