# Pending Tasks

## High Priority

### Add JSDoc comments to core exports
The @squire/core package exports many functions but lacks JSDoc documentation. Add documentation to the main exported functions in packages/core/src/index.ts to improve developer experience.

### Add --json flag to list command
The `squire list` command outputs human-readable text. Add a `--json` flag to output structured JSON for scripting and automation use cases.

## Medium Priority

### Add task history command
Create a `squire history` command that shows completed and failed tasks with their outcomes, similar to shell history.
