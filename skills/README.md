# Squire Skills

Agent skills that can be injected into Squire worker prompts to improve code quality.

## Available Skills

| Skill | Description | Use When |
|-------|-------------|----------|
| `react-best-practices` | 45 React/Next.js performance rules from Vercel | React components, data fetching, bundle optimization |
| `web-design-guidelines` | UI/UX/accessibility audit rules | Reviewing UI code, checking accessibility |

## Skill Format

Each skill follows the [agentskills.io](https://agentskills.io) specification:

```
skills/<name>/
├── SKILL.md       # Quick reference (always loaded)
├── AGENTS.md      # Full detailed guide (optional, loaded on demand)
├── metadata.json  # Version, author, references
└── rules/         # Individual rule files (optional)
```

## Usage in Squire

Skills can be injected into worker prompts based on task type:

```typescript
// Example: detect React task and inject skill
if (taskDescription.match(/react|next\.js|component/i)) {
  prompt += await readFile('skills/react-best-practices/SKILL.md')
}
```

## Adding New Skills

1. Create folder: `skills/<skill-name>/`
2. Add `SKILL.md` with frontmatter (name, description, metadata)
3. Optionally add `AGENTS.md` for detailed content
4. Test with Squire worker

## Sources

- [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) - React best practices, web design guidelines
- [agentskills.io](https://agentskills.io) - Skill format specification
