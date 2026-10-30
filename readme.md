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

##### Wildcard Services

A service with **Wildcard** checked (Services → the service → Subdomain Settings) also answers for every subdomain of its own host: a service at `maker.example.com` also receives `shop.maker.example.com`, `anything.maker.example.com`, and so on, without the proxy having to know the names. Use it in front of an app that creates subdomains by itself (a multi-tenant platform) so that adding a subdomain takes no change here.

- **Routing** - Only the service's own host and subdomains of it are matched. An explicitly configured service still wins over a wildcard for its own host.
- **Certificates** - Let's Encrypt only issues wildcard certificates through a DNS challenge, so a secure wildcard service gets a certificate of its own (covering its host and `*.` of it) instead of joining the shared one. This is optional and off by default: turn on **Enable wildcard certificates** in the **Certificates** section and save the configuration. Turning it on installs Certbot's Route53 plugin (`python3-certbot-dns-route53` with apt, `certbot-dns-route53` with snap) when it is missing, which needs passwordless `sudo` like the rest of certificate provisioning. If that fails, the page shows the commands to run by hand, and the **Install Plugin** button tries again. The AWS access key for the DNS challenge is entered in **Secrets** (two extra fields appear there while the option is on), separate from Dynamic DNS, and is copied to a root-only file for Certbot and its daily renewals. Then provision certificates as usual. The proxy picks the certificate by the name the browser asks for, so no restart is needed for new subdomains.
- **IAM** - The access key for wildcard certificates only needs to answer the DNS challenge. Attach a policy like this (replace `YOUR_HOSTED_ZONE_ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZones", "route53:GetChange"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ChangeResourceRecordSets"],
      "Resource": "arn:aws:route53:::hostedzone/YOUR_HOSTED_ZONE_ID",
      "Condition": { "ForAllValues:StringEquals": { "route53:ChangeResourceRecordSetsRecordTypes": ["TXT"] } }
    }
  ]
}
```

- **DNS** - The wildcard host needs DNS records for itself and `*.` of itself (`maker.example.com` and `*.maker.example.com`). A wildcard record like `*.example.com` does not cover them once `maker.example.com` has any record of its own, or while Certbot's challenge record is briefly present, so create both explicitly.

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
