# Reverse Proxy Server

A Node.js-based reverse proxy server with web-based configuration, SSL certificate management, and health monitoring.

## Prerequisites

- Port Forwarding: <your-pi-ip>:8080 and <you-pi-ip>:8443 forwarded to 80 and 443
- Raspberry Pi with Rasperry OS Lite (or similar Linux system)
- Git (to clone this repository)

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
- **Secrets** - Manage sensitive configuration values
- **Certificates** - Provision and manage SSL certificates
- **Dynamic DNS** - Set up Dynamic DNS with Amazon Route53
- **Theme** - Dark Mode all the things!
- **Advanced** - Set up body parsers and data extractors for custom healthchecks

##### Setting Up AWS IAM User for Dynamic DNS

To enable Dynamic DNS with Route53, you need to create an IAM user with the appropriate permissions:

1. **Create an IAM User** in the AWS Console:
   - Go to IAM → Users → Add User
   - Create a user with programmatic access
   - Save the Access Key ID and Secret Access Key

2. **Attach the following IAM policy** to the user (replace `YOUR_HOSTED_ZONE_ID` with your actual hosted zone ID):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "route53:ChangeResourceRecordSets"
      ],
      "Resource": "arn:aws:route53:::hostedzone/YOUR_HOSTED_ZONE_ID"
    },
    {
      "Effect": "Allow",
      "Action": [
        "route53:GetChange"
      ],
      "Resource": "arn:aws:route53:::change/*"
    }
  ]
}
```

3. **Configure in the Web Interface**:
   - Navigate to the Dynamic DNS section
   - Enter your AWS Access Key ID
   - Enter your AWS Secret Access Key
   - Enter your AWS Region (e.g., `us-east-1`)
   - Enter your Route53 Hosted Zone ID
   - Enable the Dynamic DNS feature

This policy follows the principle of least privilege, granting only the permissions necessary to update DNS records in your specific hosted zone.

#### API Authentication

You can protect the API web page (/web/public/api/) with authentication by setting the  **API Password** in the **Secrets** section of the web configurator. Passwords entered in the UI will be hashed on the server before they are saved.

#### Configuration
- **Domain** - Set your primary domain
- **Services** - Add and configure reverse proxy services with:
  - Subdomain settings
  - Protocol (HTTP/HTTPS)
  - Proxy targets
  - Healthchecks
### Service Types

The reverse proxy supports different service types for different use cases:

#### `proxy`
Proxies requests to another service running on a different port or server.
- Use for: Backend APIs, other web services
- Example: Proxying to a service running on `192.168.1.100:3000`

#### `index`
Serves static files with an `index.html` file.
- Use for: Traditional static websites
- Serves files from `web/public/{servicename}/`
- Returns `404.html` for non-existent routes

#### `spa` (Single-Page Webapp)
Optimized for modern JavaScript frameworks like React, Angular, Vue.js, etc.
- Use for: Single Page Applications with client-side routing
- Serves files from `web/public/{servicename}/`
- All non-file routes return `index.html` to support client-side routing
- Optimized caching:
  - HTML files: No caching (always fetch fresh)
  - Static assets (JS, CSS, images): Cached for 1 year with immutable flag

#### `dirlist`
Serves a directory listing with optional basic authentication.
- Use for: File browsers, download directories
- Supports basic authentication for protected directories
