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

---

## 4. Optimizing the LSP (Language Server Protocol) Layer

The LSP layer powers post-write semantic diagnostics inside `write_file` and `patch`. This drastically improves coding accuracy on the VPS.

### Installation and Dependencies

You can install all compatible language servers (Python, TS, JS, Vue, Svelte, Bash, Dockerfile, YAML, PHP) to `~/.hermes/lsp` automatically:
```bash
hermes lsp install-all
```

*   **Bash Integration Pitfall:** The `bash-language-server` requires `shellcheck` installed on the host system to generate diagnostics. If missing, diagnostics for shell scripts will be empty.
    *   **Fix:** Install it via your package manager:
        ```bash
        sudo apt install shellcheck
        ```

### Tuning your `config.yaml`
Add or update the `lsp:` block in `~/.hermes/config.yaml` to configure behavior:
```yaml
lsp:
  enabled: true             # Master toggle
  wait_mode: document       # "document" (focused file) or "full" (workspace-wide)
  wait_timeout: 5.0         # Max seconds to block waiting for diagnostics
  install_strategy: auto    # "auto" (install npm/go/pip servers on use) or "manual"
  servers:
    pyright:
      disabled: false       # Disable individual servers if needed
```

---

## 5. Modern Python Environment Management (PEP 668, `uv`, and `pipx`)

Modern Debian/Ubuntu systems on a VPS enforce **PEP 668 (externally-managed-environment)**, blocking global `pip install` commands outside virtual environments to prevent system packaging conflicts.

### Best Practices for Python Developers on a VPS

1.  **Use `uv` (Blazing Fast & Recommended):**
    `uv` is a modern, Rust-based, drop-in replacement for `pip` and `virtualenv`. It completely bypasses PEP 668 errors on your system when operating inside virtual environments.
    *   **Create virtualenv:** `uv venv`
    *   **Install packages:** `uv pip install <package>`
2.  **Use `pipx` for CLI Tools:**
    If you want to install standalone Python tools globally (like `black`, `flake8`, etc.), install `pipx` which handles isolation automatically:
    ```bash
    sudo apt install pipx
    pipx install <package>
    ```
3.  **Ensure Standard library virtualenv support:**
    If standard `python3 -m venv` is preferred, make sure the `python3-venv` package is installed:
    ```bash
    sudo apt install python3-venv
    ```

---

## 6. Dashboard Security Hardening & Systemd Crash Loops (PEP 668/June 2026 Hardening)

Recent security hardening in Hermes Agent (June 2026) disables unauthenticated public/non-loopback binds (`0.0.0.0`). Non-loopback binds now ALWAYS require an auth provider to prevent exposing the dashboard to the open internet without security.

### The Dashboard Infinite Crash Loop Pitfall
- **The Issue:** If you run the Web Dashboard inside systemd (e.g. `hermes-dashboard.service`) using `--host 0.0.0.0` (to allow a reverse proxy Docker container like `nginx-proxy` or `hermes-dashboard-proxy` to connect to it), but do **not** have any auth providers configured in `~/.hermes/config.yaml`, the dashboard service will fail with exit code `1` and restart infinitely.
  The logs (`gui.log` or journalctl) will repeatedly display:
  ```
  Refusing to bind dashboard to 0.0.0.0 — the auth gate engages on non-loopback binds, but no auth providers are registered.
  ```
- **The Fix:** Register a basic authentication provider inside `~/.hermes/config.yaml`:
  1. **Generate your password hash:**
     Run this Python command inside the active Hermes virtual environment on your VPS:
     ```bash
     /usr/local/lib/hermes-agent/venv/bin/python -c "from plugins.dashboard_auth.basic import hash_password; print(hash_password('your-desired-password'))"
     ```
  2. **Configure basic auth:**
     Open `~/.hermes/config.yaml` and configure the `dashboard.basic_auth` block:
     ```yaml
     dashboard:
       basic_auth:
         username: "admin"
         password_hash: "pbkdf2:sha256:250000$..."  # Paste the generated hash here
     ```
  3. **Restart the dashboard service:**
     ```bash
     systemctl restart hermes-dashboard.service
     ```

### The Auto-SSO 500 Internal Server Error Pitfall (Password-Only Auth)
- **The Issue:** When only a single password-only authentication provider (like `basic_auth`) was configured with no other OAuth providers, accessing the dashboard root (`/`) resulted in a `500 Internal Server Error`. Under the hood, the auto-SSO middleware would attempt to automatically redirect the unauthenticated user using the single session provider to `/auth/login?provider=basic`. Since password providers do not support OAuth-style redirects, the `start_login` method raised `NotImplementedError`, which went uncaught and crashed the server.
- **The Fix:** 
  1. **Bypass Auto-SSO for Passwords:** We updated the auto-SSO middleware (`_auto_sso_response` in `/usr/local/lib/hermes-agent/hermes_cli/dashboard_auth/middleware.py`) to bypass the auto-SSO redirect if the provider has `supports_password` set to `True` (meaning it requires username/password input on the login page). The request now cleanly falls back to rendering the `/login` page with the sign-in form.
  2. **Defensive Error Handling:** We updated the route `/auth/login` (in `/usr/local/lib/hermes-agent/hermes_cli/dashboard_auth/routes.py`) to catch `NotImplementedError` and return a clean `400 Bad Request` (such as `{"detail": "Provider does not support redirect login: 'basic'"}`) instead of crashing with a `500`.
  3. **Restarting Services on a VPS:** Note that on VPS setups, the web dashboard often runs as a separate system-wide unit (e.g. `hermes-dashboard.service`) rather than inside the `hermes-gateway.service` user unit. To apply Python auth modifications, always restart the dashboard service:
     ```bash
     systemctl restart hermes-dashboard.service
     ```
     If you hit the `Provider does not support redirect login` error in your browser, it means the browser is still refreshing the old cached `/auth/login` page; navigate back to the root `/` or `/login` to render the password sign-in form.

