---
name: wordpress-development
description: "Best practices, pitfalls, and workflows for pragmatic WordPress development on Docker-based VPS environments, including Tailwind CSS integrations."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [wordpress, php, docker, tailwindcss, vps, deployment]
    related_skills: [plan, systematic-debugging, test-driven-development]
---

# WordPress Development on Docker VPS

This skill covers the workflows, architectural conventions, and pitfalls for developing custom themes and features on Docker-composed WordPress stacks.

## Style & Engineering Principles

As a pragmatic senior engineer, focus on:
- **Operational Reality:** Prioritize correctness and actual runtime behavior over theoretical purity. Prefer practical, direct tradeoffs over idealized abstractions.
- **Direct & Concise Style:** Be exceptionally direct and concise unless the complexity of the task strictly requires deep explanation. Avoid overexplaining obvious things.
- **Strictly No Hype:** Eliminate sycophancy, "hype" language, and patronizing filler words. 
- **Identify Bad Ideas Promptly:** Call out poor architectural patterns, incomplete steps, or security flaws clearly and immediately.
- **No Incomplete/Stub Delivery:** Deliver fully finished, syntactically verified, and deployable code artifacts (e.g., templates, functions) rather than placeholders or descriptive drafts.

---

## Core Workflows

### 1. Theme Asset & CSS Pipeline (Tailwind v4)
Modern custom themes use Tailwind v4. The Tailwind CLI is invoked directly inside the specific theme directory.

**Working Directory:** `wp-content/themes/<your-theme-name>/`

**Commands:**
```bash
# Build CSS once (always recompile after changing PHP templates)
npx @tailwindcss/cli -i assets/css/src/input.css -o assets/css/src/output.css

# Watch for live CSS changes during development
npx @tailwindcss/cli -i assets/css/src/input.css -o assets/css/src/output.css --watch
```

*Never edit `output.css` directly.* Always edit `input.css` or classes in PHP templates, then rebuild.

### 2. Using WP-CLI on the Host
If WP-CLI is installed on the host but the host's native PHP environment is missing extensions (like `mysqli`), running bare `wp` commands from the repo root may fail.

**Pragmatic Workarounds:**
1. **Run as Root with Flag:** Use `--allow-root` if running commands on VPS as the root user.
2. **Execute inside the WordPress Container (Recommended & Persistent):**
   Do NOT manually download the WP-CLI Phar inside the container. It is transient and will be lost whenever the container is recreated or the image is updated. It is also prone to file-permission and typo errors (e.g. downloading as `wp#` without executable bits).
   Instead, map the host's `/usr/local/bin/wp` binary into the container as a read-only volume inside `compose.yaml`:
   ```yaml
   services:
     wordpress:
       volumes:
         - "/usr/local/bin/wp:/usr/local/bin/wp:ro"
   ```
   After restarting the container (`docker compose up -d`), you can execute WP-CLI commands perfectly and persistently inside the container:
   ```bash
   docker compose exec wordpress wp <command> --allow-root
   ```

---

## Critical Pitfalls & Solutions

### The 0-Byte Template Trap (White Screen of Death)
**Problem:** Having empty (0-byte) template files like `single.php` or `home.php` in a theme folder is a major hazard. WordPress detects their presence in the template hierarchy and loads them anyway. Since they are empty, the site serves a completely blank white screen to visitors for those routes.

**Solution:**
- Never leave blank/empty files in the template directory.
- Either delete the stubs entirely so WordPress falls back to `index.php` automatically, or implement a basic fallback layout:
  ```php
  <?php
  /**
   * Fallback Template
   */
  get_header();
  if (have_posts()) :
      while (have_posts()) : the_post();
          the_content();
      endwhile;
  endif;
  get_footer();
  ```

### Terminating TLS at Reverse Proxies
When using containers behind an Nginx reverse proxy (such as `nginxproxy/nginx-proxy`), SSL/TLS is terminated at the proxy, not at the WordPress container.
* **Problem:** WordPress may serve HTTP assets instead of HTTPS, causing mixed-content blockages, or cause infinite redirection loops.
* **Solution:** Force HTTPS in `wp-config.php` when forwarded from a proxy:
  ```php
  if (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') {
      $_SERVER['HTTPS'] = 'on';
  }
  ```

---

## Porting Layouts & Theme Synchronization
When copying features (such as blog indexes, contact pages, or single-post custom structures) from one theme on the VPS to another:
1. **Verify Brand Design Systems:** Port the HTML/PHP structures first, then adapt the styling variables (colors like brand-green, text classes, dark/light themes) to preserve brand identity.
2. **Sanitize & Escape:** Adhere strictly to WordPress security:
   - **Sanitize on Input:** Use `sanitize_text_field()`, `absint()`, `sanitize_email()` before saving to database or triggering webhooks.
   - **Escape on Output:** Always wrap echos in escaping functions: `esc_html()`, `esc_url()`, `esc_attr()`.
