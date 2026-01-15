import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface SquireConfig {
  githubToken?: string;
  model?: string;
  tasksDir?: string;
  workerImage?: string;
  maxConcurrent?: number;  // Max parallel tasks (default: 5)
  autoCleanup?: boolean;   // Auto-remove containers on task completion (default: true)
}

const CONFIG_PATHS = [
  join(process.cwd(), 'squire.config.json'),
  join(homedir(), '.squire', 'config.json'),
  join(homedir(), '.config', 'squire', 'config.json'),
];

let cachedConfig: SquireConfig | null = null;

export function getConfig(): SquireConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Start with environment variables
  const config: SquireConfig = {
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    model: process.env.SQUIRE_MODEL || 'opencode/glm-4.7-free',
    tasksDir: process.env.SQUIRE_TASKS_DIR,
    workerImage: process.env.SQUIRE_WORKER_IMAGE || 'squire-worker:latest',
    maxConcurrent: process.env.SQUIRE_MAX_CONCURRENT ? parseInt(process.env.SQUIRE_MAX_CONCURRENT, 10) : 5,
    autoCleanup: process.env.SQUIRE_AUTO_CLEANUP !== 'false',  // Default true
  };

  // Try to load config file
  for (const configPath of CONFIG_PATHS) {
    if (existsSync(configPath)) {
      try {
        const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
        // File config can override env vars
        if (fileConfig.githubToken) config.githubToken = fileConfig.githubToken;
        if (fileConfig.model) config.model = fileConfig.model;
        if (fileConfig.tasksDir) config.tasksDir = fileConfig.tasksDir;
        if (fileConfig.workerImage) config.workerImage = fileConfig.workerImage;
        if (fileConfig.maxConcurrent) config.maxConcurrent = fileConfig.maxConcurrent;
        if (fileConfig.autoCleanup !== undefined) config.autoCleanup = fileConfig.autoCleanup;
        break;
      } catch {
        // Ignore invalid config files
      }
    }
  }

  cachedConfig = config;
  return config;
}
