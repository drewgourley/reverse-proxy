#!/bin/bash

# Installation script for Raspberry Pi 5 (Lite OS)
# This script installs Node.js, PM2, and Certbot

set -e  # Exit on error

echo "==========================================="
echo "Reverse Proxy - Installation Script"
echo "==========================================="
echo ""

# Update system packages
echo "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install redis server
echo ""
echo "Installing Redis server..."
sudo apt install -y redis-server

# Start and Daemonize Redis
echo ""
echo "Starting and enabling Redis server..."
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Verify Redis installation
echo ""
echo "Redis status:"
sudo systemctl status redis-server --no-pager

# Install Node.js (using NodeSource repository for latest LTS)
echo ""
echo "Installing Node.js..."

# Remove old Node.js versions if present
sudo apt remove -y nodejs npm || true

# Install Node.js 20.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
echo ""
echo "Node.js version:"
node --version
echo "npm version:"
npm --version

# Install PM2 globally
echo ""
echo "Installing PM2..."
sudo npm install -g pm2

# Setup PM2 to start on boot
echo ""
echo "Configuring PM2 to start on boot..."
pm2 startup systemd -u $USER --hp $HOME | grep -v "PM2" | bash || true

# Verify PM2 installation
echo ""
echo "PM2 version:"
pm2 --version

# Install PM2 Logrotate module, automatically limits log file sizes to 10M
echo ""
echo "Installing PM2 Logrotate module..."
pm2 install pm2-logrotate

# Install Certbot
echo ""
echo "Installing Certbot..."
sudo apt install -y certbot

# Verify Certbot installation
echo ""
echo "Certbot version:"
certbot --version

# Install project dependencies
echo ""
echo "Installing project dependencies..."
npm install

echo ""
echo "==========================================="
echo "Installation Complete!"
echo "==========================================="
echo ""
echo "Installed:"
echo "  - Node.js $(node --version)"
echo "  - npm $(npm --version)"
echo "  - PM2 $(pm2 --version)"
echo "  - Certbot $(certbot --version)"
echo ""
echo "Starting the configurator..."
echo "Open http://<your-pi-ip>:3000 in your browser"
echo ""
echo "Next steps:"
echo "  1. Configure your application name"
echo "  2. Set up secrets (admin email, etc.)"
echo "  3. Configure your domain and services"
echo "  4. Provision SSL certificates (if needed)"
echo ""

# Start the configurator
npm start
