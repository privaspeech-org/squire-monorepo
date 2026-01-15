# Contributing to Squire

Thank you for your interest in contributing! This document provides guidelines for contributing to Squire.

## Prerequisites

- **Node.js**: Version 22 or higher
- **Docker**: For building and running worker containers
- **GitHub token**: For testing PR creation (set via `GITHUB_TOKEN` environment variable or config)

## Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/privaspeech-org/squire-monorepo.git
cd squire-monorepo
```

2. **Install dependencies**

```bash
pnpm install
```

3. **Build the project**

```bash
pnpm run build
```

4. **Build the Docker worker image**

```bash
docker build -t squire-worker .
```

5. **Link for local development**

```bash
pnpm link --global
```

Now you can run `squire` commands directly from your local clone.

## Development

### Building

```bash
pnpm run build    # Build once
pnpm run dev      # Watch mode (rebuilds on changes)
```

### Running the CLI

After linking with `pnpm link --global`, you can run:

```bash
squire --help
```

Or run directly:

```bash
pnpm start -- --help
node packages/cli/dist/index.js --help
```

## Testing

The project has 72 automated tests that can be run with:

```bash
pnpm test
```

To test changes manually:

1. Create a test task against a fork or test repository:

```bash
export GITHUB_TOKEN=ghp_your_test_token
squire new YOUR_USERNAME/test-repo "Add a simple test" --base main
```

2. Monitor the task:

```bash
squire status <task-id>
squire logs <task-id>
```

3. Verify the PR created matches expectations.

## Project Structure

```
squire-monorepo/
├── packages/
│   ├── core/          # Core task management and utilities
│   ├── cli/           # Command-line interface
│   └── steward/       # Task orchestration and worker management
├── apps/
│   └── worker/        # Docker worker application
└── packages/*/dist/  # Compiled output (generated)
```

## Code Style

- Use **TypeScript** with strict mode enabled
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Keep functions small and focused
- Add type annotations where the type is not obvious

### TypeScript Configuration

The project uses strict TypeScript settings:
- Target: ES2022
- Module: NodeNext
- Strict mode: enabled

## Adding New Features

### Adding a New CLI Command

1. Create a new file in `packages/cli/src/commands/` (e.g., `newCommand.ts`)
2. Export a function that implements `Command` interface
3. Register it in `packages/cli/src/index.ts`
4. Add documentation in `README.md`

Example:

```typescript
import { Command } from 'commander';

export const myCommand = new Command('mycommand')
  .description('Description of command')
  .option('--opt <value>', 'Option description')
  .action(async (options) => {
    // Implementation
  });
```

### Modifying Worker Behavior

Worker behavior is controlled by:
- `apps/worker/entrypoint.sh` - Shell script that runs in container
- `apps/worker/agent-prompt.md` - Prompt sent to OpenCode

Modify these carefully as they affect how tasks are executed.

## Submitting Changes

1. **Create a feature branch**

```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes**

3. **Build and test locally**

```bash
pnpm run build
pnpm test
# Manual testing with squire new/status/logs commands
```

4. **Commit your changes**

Use clear, descriptive commit messages:

```bash
git add .
git commit -m "Add: implement new feature X"
```

5. **Push to your fork**

```bash
git push origin feature/your-feature-name
```

6. **Create a pull request**

- Describe your changes clearly
- Reference any related issues
- Include screenshots or examples if applicable

## Pull Request Guidelines

- **Keep it small**: Smaller PRs are easier to review
- **Update documentation**: If you change behavior, update README.md
- **Test thoroughly**: Ensure existing functionality still works
- **Be responsive**: Address review feedback promptly

## Issues

If you find a bug or have a feature request:

1. Check existing issues first
2. Use clear titles and descriptions
3. Provide reproduction steps for bugs
4. Include environment details (Node.js version, Docker version, etc.)

## Questions?

Feel free to open an issue with the `question` label if you have questions about contributing.
