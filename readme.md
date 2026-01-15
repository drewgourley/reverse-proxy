# Reverse Proxy Server

A Node.js-based reverse proxy server with web-based configuration, SSL certificate management, and health monitoring.

## Prerequisites

- Amazon AWS Route53 Hosted Zone
- Amazon AWS IAM User with proper roles to write to and update Hosted Zone
- Raspberry Pi 5 (or similar Linux system)
- Raspberry Pi OS Lite
- Git (to clone this repository)
- Port Forwarding: <your-pi-ip>:8080 and <you-pi-ip>:8443 forwarded to 80 and 443

## Installation

### 1. Clone the Repository

```bash
sudo apt update
sudo apt install -y git
git clone https://github.com/drewgourley/reverse-proxy
cd reverse-proxy
```

### 2. Run the Installation Script

The installation script will install Node.js, PM2, and Certbot:

```bash
chmod +x install.sh
./install.sh
```

## Configuration

### Using the Web Configurator

1. Open your browser and navigate to:
   ```
   http://<your-pi-ip>:3000
   ```

2. Configure the following through the web interface:
   - **Application Settings** - Set your application name for PM2
   - **Secrets** - Add admin email and other sensitive values
   - **Domain** - Set your primary domain name
   - **Services** - Add and configure reverse proxy services
   - **Certificates** - Provision SSL certificates via Let's Encrypt

#### First-Time Setup

When you first access the configurator, it will automatically detect that PM2 has not been initialized and enter **first-time setup mode**:

- Only the **Application Settings** section will be accessible
- All other sections will be disabled until you complete the initial setup
- Set your application name and click **Generate Application Settings**
- The configurator will automatically:
  - Create the `ecosystem.config.js` file
  - Start the application with PM2
  - Save the PM2 process list to persist on reboot
- After the server restarts, all other sections will become available for configuration

### Configuration Sections

#### Management
- **Application** - Configure the PM2 process name
- **Certificates** - Provision and manage SSL certificates
- **Secrets** - Manage sensitive configuration values
- **Dynamic DNS** - Set up Dynamic DNS with Amazon Route53

#### Configuration
- **Domain** - Set your primary domain
- **Services** - Add and configure reverse proxy services with:
  - Subdomain settings
  - Protocol (HTTP/HTTPS)
  - Proxy targets
  - Health checks
