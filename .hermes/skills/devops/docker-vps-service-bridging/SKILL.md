---
name: docker-vps-service-bridging
description: "How to securely expose host-bound services (TUI dashboards, local nodes, custom dev APIs) through an in-Docker Nginx reverse proxy with automated Let's Encrypt SSL."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [docker, nginx, reverse-proxy, systemd, devops, letsencrypt, networking]
    related_skills: [wordpress-development, hermes-agent]
---

# Docker VPS Service Bridging (Host-to-Container Proxying)

This skill covers the pragmatic architectural pattern of exposing native host-level services (processes running directly on the VPS, such as the Hermes Dashboard on port 9119, or local node servers) through an in-Docker reverse proxy stack (such as `nginxproxy/nginx-proxy`) and securing them with automated Let's Encrypt certificates.

---

## The Architectural Challenge
On a modern VPS, you often run a central Docker bridge network (e.g., `webproxy`) with an Nginx reverse-proxy and an ACME companion container to automate SSL/TLS generation.
* **The Conflict:** Nginx-proxy and Let's Encrypt containers only discover and configure virtual hosts by listening to Docker socket events. They cannot natively detect or route traffic to native host-level processes running outside of Docker.
* **The Anti-Pattern:** Manually editing host Nginx configs or hardcoding raw SSL paths. This breaks containerized automation and creates maintenance overhead.

---

## The Pragmatic Solution: The Bridged Socat Proxy
Instead of building a heavy custom Docker image of your host process or breaking your ingress stack, deploy a lightweight TCP/UDP relay container (such as `alpine/socat`) directly on the Docker bridge network. 

This container receives external traffic from the proxy, bridges the Docker network barrier, and routes it directly to the host's local port.

### Step 1: Set Up host-gateway in Docker
To allow containers to securely talk back to host-bound loopback ports, use the `host-gateway` mapping.

### Step 2: Create the Compose File
In a dedicated directory for the subdomain (e.g., `/home/tevis/kanban.affiliatemarketconnect.com/`), create a `compose.yaml`:

```yaml
services:
  host-bridge-proxy:
    image: alpine/socat
    container_name: hermes-kanban-proxy
    # Listen on port 80 inside container, forward to host-gateway on port 9119
    command: tcp-listen:80,fork,reuseaddr tcp:host.docker.internal:9119
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      # Ingress environment variables for nginx-proxy
      VIRTUAL_HOST: kanban.affiliatemarketconnect.com
      VIRTUAL_PORT: "80"
      # Ingress environment variables for ACME letsencrypt companion
      LETSENCRYPT_HOST: kanban.affiliatemarketconnect.com
      LETSENCRYPT_EMAIL: tevis.johnston@affiliatemarketconnect.com
    networks:
      - webproxy
    restart: unless-stopped

networks:
  webproxy:
    external: true
    name: affiliatemarketconnectcom_webproxy
```

Launch the proxy:
```bash
docker compose up -d
```

---

## Systemd Process Supervision on the Host
To ensure your native host-bound service (e.g., `hermes dashboard`) runs continuously, automatically restarts on crashes, and persists across system reboots, configure a native `systemd` unit.

### Step 1: Create the Unit File
Write to `/etc/systemd/system/<service-name>.service`:

```ini
[Unit]
Description=Hermes Agent Web Dashboard
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root
ExecStart=/usr/local/bin/hermes dashboard --host 0.0.0.0 --port 9119 --insecure --no-open
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Step 2: Enable & Start the Service
```bash
# Reload systemd to pick up the new unit
systemctl daemon-reload

# Enable to run on system boot
systemctl enable <service-name>

# Start the service immediately
systemctl start <service-name>

# Verify active status
systemctl status <service-name> --no-pager
```

---

## Critical Pitfalls & Troubleshooting

### Port Binding Scope
* **Pitfall:** If you start the host service bound strictly to localhost loopback (`127.0.0.1:9119`), containers routing via `host-gateway` (which resolves to the bridge gateway IP, e.g., `172.17.0.1`) will get a **Connection Refused** error.
* **Solution:** Bind your host service to `0.0.0.0` so it accepts connections from any interface, including the Docker bridge gateway interface. Secure the port using standard firewall rules (like `ufw`) to block external internet access directly to port 9119, relying purely on Nginx-Proxy (port 80/443) for ingress.

### Debouncing and ACME Challenge Failures
* **Pitfall:** LetsEncrypt ACME companion uses HTTP-01 challenges, which means Let's Encrypt must reach `http://kanban.yourdomain.com/.well-known/acme-challenge/`. If the `socat` proxy starts *before* the host process is fully active, or if the port is wrong, the challenge may fail.
* **Solution:** Always verify the host process is fully started (`systemctl status`) before starting the proxy container. Check `docker logs letsencrypt` to observe the challenge process in real-time.
