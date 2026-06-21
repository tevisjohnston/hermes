# Per-Project Multi-Board Kanban Configuration

In multi-project setups (e.g., managing several distinct domains, repositories, or services), Hermes supports isolated per-project Kanban boards. This separates tasks, comment history, logs, and workspaces into dedicated queues.

## CLI Configuration Commands

### 1. Create a Project-Specific Board
When creating a board, bind it to its repository or working directory using `--default-workdir`. This ensures any workers claimed and executed on this board run inside the correct project directory automatically.

```bash
hermes kanban boards create <slug> \
  --name "<Human Readable Project Name>" \
  --default-workdir "<absolute-path-to-project-root>"
```
*Note: The board `slug` must be kebab-case (e.g., `hermes-affiliatemarketconnect` or `7figure-affiliatemarketconnect`). Display names can contain spaces, dots, and caps.*

### 2. List and Audit Active Boards
To see all boards on the machine along with their active task states:
```bash
hermes kanban boards list
```

### 3. Switch the Active Context
Switch subsequent `hermes kanban` CLI commands (create, list, link, etc.) to a specific project:
```bash
hermes kanban boards switch <slug>
```

---

## Best Practices & Workflows

1. **Absolute Workspace Paths:** Always specify the absolute path for `--default-workdir` (e.g., `/home/tevis/affiliatemarketconnect.com` instead of relative paths). This ensures Docker mounts and worker agents execute in the correct target directory regardless of where the gateway or CLI is triggered.
2. **Task Separation:** Use distinct kebab-case slugs for subdomains or microservices under the same parent brand to keep tracking queues clear.
3. **Audit Trails:** Each board stores its own local database at `~/.hermes/kanban/boards/<slug>/kanban.db`, isolating logs and attempt history per project.
