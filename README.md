# Squire Monorepo

Fire-and-forget coding tasks. Come back to a PR.

## Overview

This monorepo contains two complementary tools:

- **Squire** (`@squire/cli`) - Execute coding tasks in isolated containers
- **Steward** (`@squire/steward`) - Orchestrate tasks from goals and signals

```
Goals + Signals → Steward → Tasks → Squire → PRs
```

## Packages

| Package | Description |
|---------|-------------|
| `@squire/core` | Shared types, task management, container orchestration |
| `@squire/cli` | Squire CLI - run individual coding tasks |
| `@squire/steward` | Steward CLI - generate tasks from goals |
| `apps/worker` | Docker image with coding agent |

## Quick Start

### Squire (Individual Tasks)

```bash
# Install and build
pnpm install
pnpm build

# Create and run a task
pnpm squire new owner/repo "Fix the login bug"

# Check status
pnpm squire status <task-id>

# View logs
pnpm squire logs <task-id>

# List all tasks
pnpm squire list
```

### Steward (Task Orchestration)

```bash
# Set up environment (AI Gateway key for task analysis)
echo "AI_GATEWAY_API_KEY=your_key_here" > .env

# Create steward.yaml, goals.md, and signals/ directory
pnpm steward init

# Dry run to see what tasks would be generated
export $(cat .env | xargs) && pnpm steward run --dry-run

# Run one cycle (collect signals → analyze → dispatch tasks)
export $(cat .env | xargs) && pnpm steward run

# Run continuously (respects schedule.interval and quiet_hours)
export $(cat .env | xargs) && pnpm steward watch
```

## Configuration

### Squire Configuration

Squire looks for configuration in these locations (in order):
1. `./squire.config.json` (current directory)
2. `~/.squire/config.json`
3. `~/.config/squire/config.json`

#### Configuration Options

| Option | Environment Variable | Default | Description |
|--------|---------------------|---------|-------------|
| `githubToken` | `GITHUB_TOKEN` or `GH_TOKEN` | - | GitHub token for cloning repos and creating PRs |
| `model` | `SQUIRE_MODEL` | `opencode/glm-4.7-free` | AI model for the coding agent |
| `tasksDir` | `SQUIRE_TASKS_DIR` | `~/.squire/tasks` | Directory to store task state |
| `workerImage` | `SQUIRE_WORKER_IMAGE` | `squire-worker:latest` | Docker/Podman image for worker containers |
| `maxConcurrent` | `SQUIRE_MAX_CONCURRENT` | `5` | Maximum parallel tasks |
| `autoCleanup` | `SQUIRE_AUTO_CLEANUP` | `true` | Auto-remove containers on task completion |
| `containerRuntime` | `SQUIRE_CONTAINER_RUNTIME` | - | Container runtime (e.g., `runsc` for gVisor) |

#### Example Configuration

```json
{
  "githubToken": "ghp_xxxxxxxxxxxx",
  "model": "opencode/glm-4.7-free",
  "workerImage": "squire-worker:latest",
  "maxConcurrent": 3,
  "autoCleanup": true
}
```

#### Docker/Podman Support

Squire auto-detects your container runtime:
- If `DOCKER_HOST` is set, uses that
- Otherwise checks for Podman socket at `/run/user/$UID/podman/podman.sock`
- Falls back to default Docker socket

For Podman, ensure the socket is running:
```bash
systemctl --user start podman.socket
```

#### Container Isolation with gVisor

> **Note:** gVisor is optional but recommended for security. Squire works without gVisor, but using it provides additional isolation when executing code from arbitrary repositories.

For enhanced security when running untrusted code, Squire supports [gVisor](https://gvisor.dev/) — a container sandbox that intercepts syscalls and provides VM-like isolation with container performance.

**Setup:**
```bash
# Run the setup script
./scripts/setup-gvisor.sh

# Or install manually:
# 1. Install runsc binary
# 2. Configure Docker daemon with runsc runtime
# 3. Restart Docker
```

**Enable for Squire:**
```bash
export SQUIRE_CONTAINER_RUNTIME=runsc
```

Or in `squire.config.json`:
```json
{
  "containerRuntime": "runsc"
}
```

**Why use gVisor?**
- Workers execute code from arbitrary GitHub repos
- gVisor intercepts syscalls — container escape CVEs don't work
- Minimal performance overhead for Squire's use case (short-lived tasks)
- Defense in depth on top of Docker's isolation

### Steward Configuration

Create `steward.yaml` in your workspace:

```yaml
# Goals to achieve
goals:
  - path: ./goals.md

# Signal sources
signals:
  github:
    repos:
      - owner/repo
    watch:
      - open_prs
      - failed_ci
      - issues

# Task execution
execution:
  backend: squire
  squire:
    default_repo: owner/repo
    model: opencode/glm-4.7-free
    max_concurrent: 3

# LLM for task generation
llm:
  model: openai/gpt-4o-mini

# Schedule
schedule:
  interval: 30m
```

## Commands

### Squire Commands

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
| `squire watch <id>` | Watch task progress in real-time |
| `squire config` | Show current configuration |

### Steward Commands

| Command | Description |
|---------|-------------|
| `steward init` | Initialize workspace |
| `steward run` | Run one pipeline cycle |
| `steward run --dry-run` | Show what would be dispatched |
| `steward watch` | Continuous mode |
| `steward status` | Show current state |
| `steward signals` | List collected signals |
| `steward tasks` | List active tasks |

## Building the Worker Image

```bash
# Build with Docker
docker build -t squire-worker:latest apps/worker/

# Build with Podman
podman build -t squire-worker:latest apps/worker/
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Watch mode for development
pnpm dev
```

## Architecture

```
squire-monorepo/
├── packages/
│   ├── core/           # @squire/core - Shared functionality
│   │   └── src/
│   │       ├── types/      # Task types
│   │       ├── task/       # Task store, limits
│   │       ├── worker/     # Container management
│   │       └── utils/      # Logger
│   │
│   ├── cli/            # @squire/cli - Squire CLI
│   │   └── src/
│   │       ├── commands/   # CLI commands
│   │       └── config.ts   # Config loading
│   │
│   └── steward/        # @squire/steward - Orchestrator
│       └── src/
│           ├── pipeline/   # collect, analyze, dispatch, monitor
│           └── config.ts   # YAML config loading
│
├── apps/
│   └── worker/         # Docker image
│       ├── Dockerfile
│       ├── entrypoint.sh
│       └── agent-prompt.md
│
├── pnpm-workspace.yaml
└── turbo.json
```

## Resources

### Working with Asynchronous Coding Agents

> [Elite AI Assisted Coding: Working with Asynchronous Coding Agents](https://elite-ai-assisted-coding.dev/p/working-with-asynchronous-coding-agents) by Eleanor Berger

**Key takeaways for Squire/Steward:**

- **Complete specifications are critical** — Unlike interactive AI where you can course-correct, async agents need all context upfront. Treat failed results as "specification bugs," not agent bugs.

- **The recursive AI relationship** — Use AI to write better specs for AI. Planning assistants can identify edge cases and suggest implementations that align with existing code.

- **Verification matters** — Agents that skip test/lint verification before PR submission cause rework. Always include explicit verification steps in task definitions.

- **Parallel processing is the win** — The real productivity gain comes from running multiple agents on different tasks simultaneously while you focus on higher-value work.

- **Specification components:** Requirements + acceptance criteria + implementation plan + testing requirements + style guidelines + tool specifications.

This directly informs how Steward generates tasks for Squire — the goal is well-structured work items that an agent can complete autonomously.

## License

MIT
