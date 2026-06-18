---
name: hermes-vps-deployment
description: Best practices for deploying, securing, and maintaining Hermes Agent on a VPS using Docker and Nginx.
version: 1.0.0
platforms: [linux]
environments: [vps, docker, nginx]
metadata:
  hermes:
    tags: [devops, vps, docker, nginx, reverse-proxy, basic-auth]
---

# VPS Deployment and Security for Hermes Agent

This skill covers the best practices for deploying Hermes Agent on a Virtual Private Server (VPS), securing the web dashboard, and organizing the `.hermes` configuration folder inside a Git repository.

## 1. Organizing and Versioning the Configuration Directory

When version-controlling your `.hermes` configuration folder (e.g. inside a Git repository at `~/hermes/.hermes`):
- **The Issue:** Running `hermes` commands on the host will automatically search for and recreate a brand new `/root/.hermes` (or `~/.hermes`) directory with empty databases/configs if it doesn't find the folder in the default location.
- **The Fix:** Create a robust symbolic link on the host from the default path to the version-controlled repository path:
  ```bash
  # 1. Stop any active services holding locks on the database/logs
  hermes gateway stop
  hermes dashboard --stop

  # 2. Back up or rename any default-created configuration folder
  mv /root/.hermes /root/.hermes.old

  # 3. Establish the symlink
  ln -sf /root/hermes/.hermes /root/.hermes

  # 4. Restart services
  hermes gateway start
  ```

---

## 2. Securing the Dashboard behind `nginx-proxy` (Docker)

If your VPS uses the automated **`nginxproxy/nginx-proxy`** image (with or without `acme-companion` for Let's Encrypt), and you route subdomain traffic to the host via a `socat` bridge (e.g., `hermes-dashboard-proxy` forwarding to `9119`), you can secure the dashboard with a custom Basic Authentication gate.

### Step-by-Step Security Implementation (Zero Downtime)

To prevent disrupting other websites running on the same Nginx proxy container:

1. **Generate the Apache MD5 Password Hash:**
   Generate the password hash on the host using `openssl`:
   ```bash
   openssl passwd -apr1 your_password
   ```
   *Output format:* `$apr1$salt$encrypted_hash`

2. **Write the Credentials File:**
   Create the `.htpasswd` file inside the host's `vhost.d` mount directory (typically maps to `/etc/nginx/vhost.d/` inside the proxy container):
   ```bash
   echo "username:\$apr1\$salt\$encrypted_hash" > /path/to/vhost.d/hermes.htpasswd
   ```
   > ⚠️ **CRITICAL PERMISSION PITFALL:** By default, files created by root on the host have `600` permissions. While the Nginx master process (running as root) starts fine, individual authentication requests are processed by unprivileged Nginx *worker* processes (running as user `nginx` or `www-data`). If the `.htpasswd` file is not readable by workers, your browser will get a **500 Internal Server Error** and Nginx will log `failed (13: Permission denied)`. Always run:
   > ```bash
   > chmod 644 /path/to/vhost.d/hermes.htpasswd
   > ```

3. **Create the Custom Subdomain Virtual Host Config:**
   Create a dedicated Nginx configuration file named exactly after your domain under the same `vhost.d` mount directory (e.g., `hermes.example.com`):
   ```nginx
   # /path/to/vhost.d/hermes.example.com
   auth_basic "Hermes dashboard";
   auth_basic_user_file /etc/nginx/vhost.d/hermes.htpasswd;
   ```

4. **Trigger Configuration Rebuild and Reload:**
   Because `nginxproxy/nginx-proxy` uses `docker-gen` to generate server blocks, it will **not** automatically detect a newly added file inside `vhost.d` unless a container event occurs.
   - **Action:** Restart your bridge/proxy target container to force `docker-gen` to rebuild the configuration:
     ```bash
     docker restart <target-bridge-container>
     ```
   - **Action:** Trigger a graceful reload of the Nginx process inside the proxy container:
     ```bash
     docker exec nginx-proxy nginx -s reload
     ```
     *This is instantaneous, safe, and guarantees zero downtime for all other running sites.*

---

## 3. Gateway Configuration Troubleshooting

### The Discord "404 Not Found (Unknown Channel)" Failure
- **The Issue:** The gateway starts up, the Discord bot connects, but you receive no messages on the channel, and gateway logs show:
  ```
  [Discord] Failed to send Discord message: 404 Not Found (error code: 10003): Unknown Channel
  Home-channel startup notification failed for discord:<id>
  ```
- **The Root Cause:** In your `.env` file, the `DISCORD_HOME_CHANNEL` environment variable was set to the **Discord Server (Guild) ID** instead of the **Channel ID**. 
- **The Fix:** Find the correct channel ID (e.g. from the channel list or developer mode in Discord) and update your `.env` file:
  ```env
  DISCORD_HOME_CHANNEL=your_actual_channel_id_here
  ```
  Then restart the gateway service:
  ```bash
  hermes gateway restart
  ```
