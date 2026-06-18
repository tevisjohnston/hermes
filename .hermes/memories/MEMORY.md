VPS environment is configured with ~/.hermes symlinked to the git repository at ~/hermes/.hermes.
§
Specialist profiles configured for Kanban: backend-eng, frontend-eng, and reviewer.
§
VPS environment runs Docker with nginxproxy/nginx-proxy reverse proxying, and alpine/socat container 'hermes-dashboard-proxy' routing hermes.affiliatemarketconnect.com to host port 9119.
§
User's authentic .hermes directory is stored at /root/hermes/.hermes (git repository), and symlinked to /root/.hermes.
§
User runs Hermes Agent on a VPS, version-controls the .hermes directory under ~/hermes/.hermes, and prefers manually handling their own Nginx, Docker, and system configurations.