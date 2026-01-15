# Squire Monorepo - Architecture & Documentation

## Overview

A monorepo for autonomous coding agents. **Squire** executes individual coding tasks in containers, **Steward** orchestrates tasks from goals and signals.

```
Goals + Signals → Steward → Tasks → Squire → PRs
```

**Repo:** `privaspeech-org/squire-monorepo`

---

## Package Structure

```
squire-monorepo/
├── packages/
│   ├── core/           # @squire/core - Shared functionality
│   ├── cli/            # @squire/cli - Squire CLI
│   └── steward/        # @squire/steward - Orchestrator CLI
├── apps/
│   └── worker/         # Docker image for task execution
├── goals.md            # Project goals for steward
├── signals/tasks.md    # Manual task queue
├── steward.yaml        # Steward configuration
├── squire.config.example.json
├── squire.config.schema.json
└── .env                # API keys (gitignored)
```

---

## @squire/core

**Location:** `packages/core/`

Shared functionality used by both CLI and steward.

### Exports

**Task Management:**
- `createTask({ repo, prompt, branch?, baseBranch? })` - Create a new task
- `getTask(id)` - Get task by ID
- `updateTask(id, updates)` - Update task fields
- `listTasks(status?)` - List all tasks, optionally filtered
- `deleteTask(id)` - Delete a task
- `setTasksDir(path)` / `getTasksDir()` - Configure task storage

**Concurrency:**
- `countRunningTasks()` - Count active tasks
- `canStartNewTask(max)` - Check if under limit
- `waitForSlot(max)` - Wait for available slot

**Container Management:**
- `startTaskContainer(options)` - Start worker container
- `getContainerLogs(containerId, tail?)` - Get logs
- `isContainerRunning(containerId)` - Check if running
- `getContainerExitCode(containerId)` - Get exit code
- `stopContainer(containerId)` - Stop container
- `removeContainer(containerId)` - Remove container
- `listSquireContainers()` - List all squire containers

**Logging:**
- `debug/info/warn/error(component, message, metadata?)` - Log functions
- `createLogger(component)` - Create scoped logger
- `setLogLevel(level)` / `getLogLevel()` - Configure level
- `setVerbose(enabled)` - Enable debug output
- `setQuiet(enabled)` - Suppress all logs (for CLI)

### Task Type

```typescript
interface Task {
  id: string;
  repo: string;
  prompt: string;
  branch: string;
  baseBranch: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  containerId?: string;
  prUrl?: string;
  prNumber?: number;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
```

### Podman Auto-Detection

The container module auto-detects the container runtime:
1. If `DOCKER_HOST` is set, uses that
2. Checks for Podman socket at `/run/user/$UID/podman/podman.sock`
3. Checks for system Podman at `/run/podman/podman.sock`
4. Falls back to default Docker socket

---

## @squire/cli

**Location:** `packages/cli/`

CLI for running individual coding tasks.

### Commands

| Command | Description |
|---------|-------------|
| `squire new <repo> "<prompt>"` | Create and start a new task |
| `squire status <id>` | Get task status |
| `squire list` | List all tasks |
| `squire logs <id>` | View container logs |
| `squire stop <id>` | Stop a running task |
| `squire retry <id>` | Retry a failed task |
| `squire clean` | Remove old tasks and containers |
| `squire ps` | Show running containers |
| `squire watch <id>` | Watch task progress |
| `squire config` | Show current configuration |
| `squire followup <id> "<prompt>"` | Continue work on a task |
| `squire webhook` | Start webhook server |

### Configuration

**Locations (in order):**
1. `./squire.config.json`
2. `~/.squire/config.json`
3. `~/.config/squire/config.json`

**Options:**

| Option | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `githubToken` | `GITHUB_TOKEN` / `GH_TOKEN` | - | GitHub token |
| `model` | `SQUIRE_MODEL` | `opencode/glm-4.7-free` | AI model |
| `tasksDir` | `SQUIRE_TASKS_DIR` | `~/.squire/tasks` | Task storage |
| `workerImage` | `SQUIRE_WORKER_IMAGE` | `squire-worker:latest` | Worker image |
| `maxConcurrent` | `SQUIRE_MAX_CONCURRENT` | `5` | Max parallel tasks |
| `autoCleanup` | `SQUIRE_AUTO_CLEANUP` | `true` | Auto-remove containers |

### Features

- **Quiet mode** - Suppresses JSON logs for cleaner CLI output
- **Auto-cleanup** - Removes containers when tasks complete/fail
- **PR URL preservation** - Re-reads task file after container stops to capture PR URL

---

## @squire/steward

**Location:** `packages/steward/`

Orchestrator that generates tasks from goals and signals.

### Commands

| Command | Description |
|---------|-------------|
| `steward init` | Initialize workspace |
| `steward run` | Run one pipeline cycle |
| `steward run --dry-run` | Show what would be dispatched |
| `steward watch` | Continuous mode |
| `steward status` | Show current state |
| `steward signals` | List collected signals |

### Pipeline

```
1. COLLECT   → Gather signals from GitHub, files
2. ANALYZE   → LLM generates tasks from goals + signals
3. DISPATCH  → Send tasks to Squire via @squire/core API
4. MONITOR   → Track task completion
5. REPORT    → Log results
```

### Configuration (steward.yaml)

```yaml
goals:
  - path: ./goals.md

signals:
  github:
    repos:
      - privaspeech-org/squire-monorepo
    watch:
      - failed_ci      # CI failures (includes headBranch, event)
      - issues         # Open issues
      - open_prs       # Open PRs
      - greptile_reviews  # Greptile code review comments

  files:
    - ./signals/tasks.md  # Manual task queue

execution:
  backend: squire
  squire:
    default_repo: privaspeech-org/squire-monorepo
    model: opencode/glm-4.7-free
    max_concurrent: 2

llm:
  model: openai/gpt-4o-mini  # For task analysis

schedule:
  interval: 30m
  quiet_hours: "00:00-06:00"
  timezone: Europe/Copenhagen

auto_merge:  # Optional
  enabled: true
  min_confidence: 5  # Greptile confidence threshold
```

### Task Interface (LLM output)

```typescript
interface Task {
  prompt: string;
  priority: 'high' | 'medium' | 'low';
  depends_on: string[];
}
// Note: repo comes from config, not LLM
```

### Signal Types

- `github/open_pr` - Open pull requests
- `github/failed_ci` - Failed CI runs (with headBranch, event)
- `github/open_issue` - Open issues
- `github/greptile_review` - Greptile code review comments
- `file/manual_tasks` - Tasks from signal files

### Environment Variables

- `AI_GATEWAY_API_KEY` - Required for LLM task analysis
- `GITHUB_TOKEN` / `GH_TOKEN` - Required for dispatching tasks

---

## Worker Image

**Location:** `apps/worker/`

Docker image that executes coding tasks.

### Components

- `Dockerfile` - Node 22 + git + gh CLI + pnpm + OpenCode
- `entrypoint.sh` - Clones repo, runs OpenCode, creates PR
- `agent-prompt.md` - System prompt for the coding agent
- `opencode.json` - OpenCode configuration

### Environment Variables (set by squire)

- `TASK_ID` - Task identifier
- `REPO` - GitHub repo (owner/repo)
- `PROMPT` - Task description
- `BRANCH` - Branch to create
- `BASE_BRANCH` - Base branch (default: main)
- `GITHUB_TOKEN` - For cloning/pushing
- `MODEL` - AI model to use

### Workflow

1. Clone repo with `gh repo clone`
2. Auto-detect default branch
3. Create new branch from base
4. Run OpenCode with prompt
5. Commit changes with `squire:` prefix
6. Push branch
7. Create PR with `gh pr create`
8. Update task file with PR URL

### Building

```bash
podman build -t squire-worker:latest apps/worker/
# or
docker build -t squire-worker:latest apps/worker/
```

---

## Testing

**Test runner:** Node.js native test runner with tsx

**Test counts:**
- @squire/core: 30 tests (store: 17, logger: 13)
- @squire/cli: 5 tests (config)
- @squire/steward: 41 tests (collect: 19, config: 6, state: 16)
- **Total: 76 tests**

**Commands:**
```bash
pnpm test           # Run all tests
pnpm build          # Build all packages
pnpm squire <cmd>   # Run squire CLI
pnpm steward <cmd>  # Run steward CLI
```

---

## CI/CD

**GitHub Actions:** `.github/workflows/ci.yml`

- Runs on push/PR to main
- Uses pnpm 9 + Node 22
- Steps: install → build → test

**Renovate:** Manages dependency updates automatically

---

## Usage

### Run Squire (single task)

```bash
pnpm squire new privaspeech-org/squire-monorepo "Fix the bug"
pnpm squire status <id>
pnpm squire logs <id>
```

### Run Steward (orchestration)

```bash
# Setup
echo "AI_GATEWAY_API_KEY=your_key" > .env

# One-time run
export $(cat .env | xargs) && pnpm steward run

# Continuous (every 30m)
export $(cat .env | xargs) && pnpm steward watch
```

---

## Key Design Decisions

1. **Repo from config, not LLM** - The `default_repo` comes from steward.yaml, LLM only generates prompts
2. **Podman-first** - Auto-detects Podman socket before falling back to Docker
3. **Quiet CLI** - JSON logs suppressed by default for clean output
4. **Auto-cleanup** - Containers removed after task completion
5. **Programmatic API** - Steward uses @squire/core directly, not CLI subprocess
6. **File-based signals** - Manual task queue via markdown files

---

## Workflows

### Renovate + Steward Integration

1. **Renovate creates PR** with dependency update
2. **CI runs and fails** (if incompatible)
3. **Steward collects signal** - `failed_ci` with `headBranch: "renovate/..."`
4. **LLM generates task** - "Fix compatibility issue with dependency update"
5. **Squire dispatches** - Creates fix and pushes to branch
6. **CI passes** - PR ready for merge

### Manual Task Queue

1. Add task to `signals/tasks.md`:
   ```markdown
   ## Next Up
   - Add --json flag to list command
   ```
2. Run `pnpm steward run`
3. Steward picks up signal and dispatches task

---

## History of Improvements

| Issue | Fix |
|-------|-----|
| PR URL not captured | Re-read task file after container stops |
| "Jules" branding | Changed to "squire:" in commit messages |
| No pnpm in worker | Added to Dockerfile |
| Docker-only | Added Podman auto-detection |
| Noisy CLI output | Added quiet mode |
| Manual container cleanup | Added autoCleanup config |
| Global squire shadowing | Added `pnpm squire` scripts |
| LLM generating invalid repos | Repo now from config only |
| Poor Renovate integration | Added headBranch to CI signals |
