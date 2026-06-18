---
name: docker-vps-service-bridging
description: "How to securely expose host-bound services (TUI dashboards, local nodes, custom dev APIs) through an in-Docker Nginx reverse proxy with automated Let's Encrypt SSL."
version: 1.1.0
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

> ⚠️ **Do NOT use `host.docker.internal:host-gateway` to reach the host.** That alias
> resolves to the **docker0** gateway (`172.17.0.1`). Your socat container lives on the
> `webproxy` network (a *different* bridge, e.g. `172.18.0.0/16`). Reaching `172.17.0.1`
> from there requires bridge-to-bridge forwarding, which most hardened hosts drop
> (`DEFAULT_FORWARD_POLICY="DROP"` in `/etc/default/ufw`). The connection **times out**
> (not "refused"), the ACME HTTP-01 challenge fails, and you get a broken vhost.
> Instead, dial the host's gateway IP **on the same network the container is attached to**,
> and open the firewall for it (Steps 1–2 below).

### Step 1: Find the host's gateway IP on the proxy network
The host is reachable from a container at its gateway IP *on that container's network*.
Discover it for the `webproxy` network:
```bash
docker network inspect affiliatemarketconnectcom_webproxy \
  --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}'
# e.g. -> 172.18.0.1   (this is the host, as seen from the webproxy network)
```
Use this IP as the socat target (here: `172.18.0.1:9119`). It is stable unless the
`webproxy` network is recreated with a different subnet.

### Step 2: Open the firewall for Docker → host (REQUIRED)
With `ufw` active and a default-deny INPUT policy, Docker containers cannot reach a
host-bound port. Add a **scoped** rule covering all Docker bridge subnets — this opens the
port to containers only, **never** to the public internet:
```bash
ufw allow from 172.16.0.0/12 to any port 9119 proto tcp comment 'Docker bridge -> host service'
```
Verify a container on the proxy network can now reach the host service:
```bash
docker run --rm --network affiliatemarketconnectcom_webproxy alpine \
  sh -c 'apk add -q netcat-openbsd && nc -z -w3 172.18.0.1 9119 && echo OPEN || echo BLOCKED'
```

### Step 3: Create the Compose File
In a dedicated directory for the subdomain (e.g., `/home/tevis/hermes.affiliatemarketconnect.com/`), create a `compose.yaml`:

```yaml
services:
  host-bridge-proxy:
    image: alpine/socat
    container_name: hermes-dashboard-proxy
    # Listen on :80 in the container, forward to the host's gateway IP on the
    # webproxy network (from Step 1) — NOT host.docker.internal. See warning above.
    command: tcp-listen:80,fork,reuseaddr tcp:172.18.0.1:9119
    environment:
      # Ingress environment variables for nginx-proxy
      VIRTUAL_HOST: hermes.affiliatemarketconnect.com
      VIRTUAL_PORT: "80"
      # Ingress environment variables for ACME letsencrypt companion
      LETSENCRYPT_HOST: hermes.affiliatemarketconnect.com
      LETSENCRYPT_EMAIL: tevis.johnston@affiliatemarketconnect.com
    networks:
      - webproxy
    restart: unless-stopped

networks:
  webproxy:
    external: true
    name: affiliatemarketconnectcom_webproxy
```

### Step 4: Launch & Verify
```bash
docker compose up -d
# Cert issues in seconds once DNS + firewall + target IP are correct:
curl -s -o /dev/null -w "HTTPS -> %{http_code}\n" https://hermes.affiliatemarketconnect.com/
# Expect: HTTPS -> 200
```

---

## Secure Zero-Exposure Alternative: SSH Tunneling
If you do not want to expose high-privilege dashboards or services to the public internet (even with reverse-proxy authentication), you can bind the host service strictly to localhost (`127.0.0.1`) and access it securely using an SSH tunnel.

### Step 1: Start the Service on Localhost
Start the dashboard or service bound to `127.0.0.1` (which is the default behavior):
```bash
hermes dashboard --host 127.0.0.1 --port 9119 --no-open
```

### Step 2: Establish the SSH Tunnel
On your **local machine**, run the following command to map local port `9119` to the remote VPS's port `9119`:
```bash
ssh -L 9119:127.0.0.1:9119 user@your_vps_ip
```
Now, you can securely access the service in your local browser at `http://127.0.0.1:9119/kanban`.

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

## Version Controlling `.hermes` with Git & Symlink Realignment
If you want to version-control your configurations, credentials (`.env`), skills, and database configurations on Git, you can move the `~/.hermes/` directory into a workspace repository (e.g., `~/hermes/.hermes/`) and initialize it with Git. 

### Step 1: Stop Services and Move Directory
Before moving, stop all active gateway and dashboard services to release file locks:
```bash
hermes gateway stop
hermes dashboard --stop
```
Move the directory into your project repo:
```bash
mv ~/.hermes/ ~/hermes/.hermes
```

### Step 2: Establish the Directory Symlink
Because Hermes commands default to looking under `~/.hermes`, any direct execution will recreate a blank configuration folder. Link your repo folder back to `~/.hermes`:
```bash
# Delete or back up any auto-recreated folder
rm -rf ~/.hermes
# Create the symlink
ln -s ~/hermes/.hermes ~/.hermes
```

### Step 3: Configure Gitignore for Security
Ensure secrets and large caches are not pushed to public repositories. Create `~/hermes/.gitignore`:
```gitignore
.env
auth.json
cache/
logs/
image_cache/
audio_cache/
state.db-shm
state.db-wal
kanban.db-shm
kanban.db-wal
```

### Step 4: Restart Services
```bash
hermes gateway start
hermes dashboard --no-open
```

---

## Critical Pitfalls & Troubleshooting

### The #1 Failure: socat connection timeout (wrong target IP + firewall)
This is the single most common cause of a silently broken bridge. Symptoms: `docker logs
hermes-dashboard-proxy` shows `connect(... ) Operation timed out` / `tcp:...:9119:
Operation timed out`, the vhost returns a 502/no-response, and the ACME challenge fails.
Two independent root causes, both must be fixed:

1. **Wrong target IP.** `host.docker.internal` → docker0 gateway (`172.17.0.1`), which is
   *not on the webproxy network* and is unreachable across bridges when
   `DEFAULT_FORWARD_POLICY="DROP"`. **Fix:** dial the webproxy gateway IP (Step 1).
2. **Firewall blocks Docker → host.** `ufw` default-deny INPUT drops container→host traffic
   on the service port. **Fix:** the scoped `ufw allow` rule (Step 2).

> **Timeout vs. Refused:** a *timeout* means packets are being dropped (forward policy /
> firewall / wrong IP). *Connection Refused* means you reached the host but nothing is
> listening — that one really is fixed by binding the service to `0.0.0.0` (below).

### Port Binding Scope
* **Pitfall:** If the host service binds strictly to localhost (`127.0.0.1:9119`), the
  Docker bridge interface is a different interface and the container gets **Connection
  Refused**.
* **Solution:** Bind the host service to `0.0.0.0` so it accepts connections on the Docker
  bridge interface too. This is safe *only when* the public internet is still blocked —
  the scoped `ufw` rule in Step 2 opens the port to `172.16.0.0/12` (Docker) only, while
  `ufw`'s default-deny keeps it closed to the internet. Ingress stays purely via
  Nginx-Proxy on 80/443.

### Debouncing and ACME Challenge Failures
* **Pitfall:** LetsEncrypt ACME companion uses HTTP-01 challenges, which means Let's Encrypt must reach `http://kanban.yourdomain.com/.well-known/acme-challenge/`. If the `socat` proxy starts *before* the host process is fully active, or if the port is wrong, the challenge may fail.
* **Solution:** Always verify the host process is fully started (`systemctl status`) before starting the proxy container. Check `docker logs letsencrypt` to observe the challenge process in real-time.
