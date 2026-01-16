# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Test Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (turbo)
pnpm test             # Run all tests
pnpm dev              # Watch mode for development

# Run a single package's tests
node --import tsx --test packages/core/src/**/*.test.ts
node --import tsx --test packages/cli/src/**/*.test.ts
node --import tsx --test 'packages/steward/src/**/*.test.ts' 'packages/steward/src/*.test.ts'

# Run CLIs (after build)
pnpm squire <command>   # Run squire CLI
pnpm steward <command>  # Run steward CLI
```

## Architecture

This monorepo contains tools for autonomous coding agents:

```
Goals + Signals → Steward → Tasks → Squire → PRs
```

### Packages

| Package | Description |
|---------|-------------|
| `@squire/core` | Shared task management, container orchestration, logging |
| `@squire/cli` | Squire CLI - executes individual coding tasks in containers |
| `@squire/steward` | Steward CLI - orchestrates tasks from goals and GitHub signals |
| `apps/worker` | Docker image with coding agent (Node 24, git, gh CLI, pnpm, OpenCode) |

### Data Flow

1. **Steward** collects signals from GitHub (failed CI, open PRs, issues) and file-based task queues
2. **Steward** uses an LLM to generate task prompts from goals + signals
3. **Squire** dispatches tasks by starting worker containers via `@squire/core`
4. **Worker** clones repo, runs OpenCode agent, commits changes, creates PR
5. Task state is persisted as JSON files in `~/.squire/tasks/`

### Key Design Patterns

- **Repo from config, not LLM** - `default_repo` comes from steward.yaml, LLM only generates prompts
- **Podman-first** - Container module auto-detects Podman socket before Docker
- **Programmatic API** - Steward uses `@squire/core` directly, not CLI subprocess
- **File-based task queue** - Manual tasks via markdown files in `signals/`

### Core Module Exports (`@squire/core`)

Task management: `createTask`, `getTask`, `updateTask`, `listTasks`, `deleteTask`
Container management: `startTaskContainer`, `getContainerLogs`, `isContainerRunning`, `stopContainer`
Concurrency: `countRunningTasks`, `canStartNewTask`, `waitForSlot`
Logging: `createLogger`, `setLogLevel`, `setVerbose`, `setQuiet`

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
}
```

## Configuration Files

- `squire.config.json` - Squire configuration (githubToken, model, workerImage, maxConcurrent)
- `steward.yaml` - Steward configuration (goals, signals, execution backend, LLM model)
- `.env` - API keys (AI_GATEWAY_API_KEY for Steward's LLM)

## Building the Worker Image

```bash
podman build -t squire-worker:latest apps/worker/
```
