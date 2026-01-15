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
      model: string;
      max_concurrent: number;
    };
  };
  notify?: {
    telegram?: { chat_id: string };
    slack?: { webhook: string };
  };
  llm: {
    provider: 'openai' | 'anthropic' | 'opencode';
    model: string;
  };
  schedule: {
    interval: string;
    quiet_hours: string;
    timezone: string;
  };
}

export async function loadConfig(): Promise<StewardConfig> {
  const configPath = './steward.yaml';
  
  if (!existsSync(configPath)) {
    throw new Error('steward.yaml not found. Run `steward init` first.');
  }
  
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
