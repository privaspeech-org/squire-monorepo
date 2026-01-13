import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface JulesConfig {
  githubToken?: string;
  model?: string;
  tasksDir?: string;
  workerImage?: string;
  maxConcurrent?: number;  // Max parallel tasks (default: 5)
}

const CONFIG_PATHS = [
  join(process.cwd(), 'jules.config.json'),
  join(homedir(), '.jules', 'config.json'),
  join(homedir(), '.config', 'jules', 'config.json'),
];

let cachedConfig: JulesConfig | null = null;

export function getConfig(): JulesConfig {
  if (cachedConfig) {
    return cachedConfig;
  }
  
  // Start with environment variables
  const config: JulesConfig = {
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
    model: process.env.JULES_MODEL || 'opencode/glm-4.7-free',
    tasksDir: process.env.JULES_TASKS_DIR,
    workerImage: process.env.JULES_WORKER_IMAGE || 'jules-worker:latest',
    maxConcurrent: process.env.JULES_MAX_CONCURRENT ? parseInt(process.env.JULES_MAX_CONCURRENT, 10) : 5,
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
        break;
      } catch {
        // Ignore invalid config files
      }
    }
  }
  
  cachedConfig = config;
  return config;
}
