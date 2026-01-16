# Squire Web UI

A beautiful web interface for managing and monitoring Squire autonomous coding tasks.

## Features

- **Dashboard**: Real-time overview of all tasks with statistics
- **Task Management**: Create, start, stop, retry, and delete tasks
- **Task Details**: View detailed task information, logs, and PR status
- **Live Updates**: Auto-refreshing data to show current task status
- **Modern UI**: Built with Next.js 15, shadcn/ui, and Tailwind CSS

## Development

```bash
# Install dependencies (from monorepo root)
pnpm install

# Start development server
cd apps/web
pnpm dev

# Or from root
pnpm --filter @squire/web dev
```

The application will be available at `http://localhost:3000`.

## Production Build

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

## Environment Variables

The web UI uses the same configuration as the Squire CLI:

- Tasks directory: `~/.squire/tasks/` (or `SQUIRE_TASKS_DIR`)
- GitHub token: From `squire.config.json` or environment variables

## API Routes

The web UI provides the following API endpoints:

- `GET /api/tasks` - List all tasks (filterable by status)
- `POST /api/tasks` - Create a new task
- `GET /api/tasks/[id]` - Get task details
- `DELETE /api/tasks/[id]` - Delete a task
- `POST /api/tasks/[id]/start` - Start a task
- `POST /api/tasks/[id]/stop` - Stop a running task
- `GET /api/tasks/[id]/logs` - Get container logs
- `GET /api/stats` - Get task statistics

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Date Formatting**: date-fns
- **Core Integration**: @squire/core package
