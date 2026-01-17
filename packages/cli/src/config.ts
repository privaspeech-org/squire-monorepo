import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execSync } from 'node:child_process';

export interface SquireConfig {
  githubToken?: string;
  model?: string;
  tasksDir?: string;
  workerImage?: string;
  skillsDir?: string;       // Path to skills directory (mounted at /skills in container)
  maxConcurrent?: number;  // Max parallel tasks (default: 5)
  autoCleanup?: boolean;   // Auto-remove containers on task completion (default: true)
  containerRuntime?: string; // Container runtime (e.g., 'runsc' for gVisor isolation)
}

const CONFIG_PATHS = [
  join(process.cwd(), 'squire.config.json'),
  join(homedir(), '.squire', 'config.json'),
  join(homedir(), '.config', 'squire', 'config.json'),
];

function getGhAuthToken(): string | undefined {
  try {
    return execSync('gh auth token', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return undefined;
  }
}

let cachedConfig: SquireConfig | null = null;

export function getConfig(): SquireConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // Start with environment variables, fall back to gh CLI
  const config: SquireConfig = {
    githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || getGhAuthToken(),
    model: process.env.SQUIRE_MODEL || 'opencode/glm-4.7-free',
    tasksDir: process.env.SQUIRE_TASKS_DIR,
    workerImage: process.env.SQUIRE_WORKER_IMAGE || 'squire-worker:latest',
    skillsDir: process.env.SQUIRE_SKILLS_DIR,
    maxConcurrent: process.env.SQUIRE_MAX_CONCURRENT ? parseInt(process.env.SQUIRE_MAX_CONCURRENT, 10) : 5,
    autoCleanup: process.env.SQUIRE_AUTO_CLEANUP !== 'false',  // Default true
    containerRuntime: process.env.SQUIRE_CONTAINER_RUNTIME,  // e.g., 'runsc' for gVisor
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
        if (fileConfig.skillsDir) config.skillsDir = fileConfig.skillsDir;
        if (fileConfig.maxConcurrent) config.maxConcurrent = fileConfig.maxConcurrent;
        if (fileConfig.autoCleanup !== undefined) config.autoCleanup = fileConfig.autoCleanup;
        if (fileConfig.containerRuntime) config.containerRuntime = fileConfig.containerRuntime;
        break;
      } catch {
        // Ignore invalid config files
      }
    }
  }

  cachedConfig = config;
  return config;
}
