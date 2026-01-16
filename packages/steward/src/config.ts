import { readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';

export interface StewardConfig {
  goals: Array<{ path?: string; text?: string }>;
  signals: {
    github?: {
      repos: string[];
      watch: ('open_prs' | 'failed_ci' | 'issues' | 'greptile_reviews')[];
    };
    posthog?: {
      project: string;
      events: string[];
    };
    files?: string[];
  };
  execution: {
    backend: 'squire' | 'github-issues';
    squire?: {
      default_repo: string;
      repos?: string[];  // Additional repos to orchestrate (uses signals repos if not set)
      model: string;
      max_concurrent: number;
      max_per_repo?: number;  // Max concurrent tasks per repo (default: no limit)
    };
  };
  auto_merge?: {
    enabled: boolean;
    min_confidence: number;
  };
  notify?: {
    telegram?: { chat_id: string };
    slack?: { webhook: string };
  };
  llm: {
    model: string;
  };
  schedule: {
    interval: string;
    quiet_hours: string;
    timezone: string;
  };
}

export function resolveConfigPath(): string {
  const configPaths = [
    process.env.STEWARD_CONFIG_PATH,
    '/config/steward.yaml',  // K8s ConfigMap mount
    './steward.yaml',         // Local development
  ].filter((p): p is string => Boolean(p));

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      return configPath;
    }
  }

  throw new Error(
    'steward.yaml not found. Searched paths:\n' +
    configPaths.map(p => `  - ${p}`).join('\n') +
    '\nRun `steward init` or set STEWARD_CONFIG_PATH environment variable.'
  );
}

export async function loadConfig(): Promise<StewardConfig> {
  const configPath = resolveConfigPath();
  const content = readFileSync(configPath, 'utf-8');
  return parse(content) as StewardConfig;
}

export function loadGoals(config: StewardConfig): string {
  const parts: string[] = [];

  for (const goal of config.goals) {
    if (goal.path && existsSync(goal.path)) {
      parts.push(readFileSync(goal.path, 'utf-8'));
    }
    if (goal.text) {
      parts.push(goal.text);
    }
  }

  return parts.join('\n\n');
}
