import Docker from 'dockerode';
import type { Task } from '../task/types.js';
import { updateTask } from '../task/store.js';

const docker = new Docker();

const WORKER_IMAGE = process.env.SQUIRE_WORKER_IMAGE || 'squire-worker:latest';

export interface ContainerOptions {
  task: Task;
  githubToken: string;
  model?: string;
  verbose?: boolean;
}

/**
 * Start a container to execute a task.
 * The container runs async (detached) and updates the task file on completion.
 */
export async function startTaskContainer(options: ContainerOptions): Promise<string> {
  const { task, githubToken, model, verbose } = options;
  
  // Environment variables for the worker
  const env = [
    `TASK_ID=${task.id}`,
    `REPO=${task.repo}`,
    `PROMPT=${task.prompt}`,
    `BRANCH=${task.branch}`,
    `BASE_BRANCH=${task.baseBranch || 'main'}`,
    `GITHUB_TOKEN=${githubToken}`,
    `MODEL=${model || 'opencode/glm-4.7-free'}`,
  ];
  
  // Mount tasks directory so container can update task status
  const tasksDir = process.env.SQUIRE_TASKS_DIR || `${process.cwd()}/tasks`;
  
  const container = await docker.createContainer({
    Image: WORKER_IMAGE,
    Env: env,
    HostConfig: {
      Binds: [
        `${tasksDir}:/tasks:rw`,
      ],
      AutoRemove: false, // Keep container for logs
    },
    Labels: {
      'squire.task.id': task.id,
      'squire.repo': task.repo,
    },
  });
  
  // Start the container (async, detached)
  await container.start();
  
  const containerId = container.id;
  
  // Update task with container ID and status
  updateTask(task.id, {
    status: 'running',
    containerId,
    startedAt: new Date().toISOString(),
  });
  
  if (verbose) {
    console.log(`Started container ${containerId.slice(0, 12)} for task ${task.id}`);
  }
  
  return containerId;
}

/**
 * Get logs from a task's container.
 */
export async function getContainerLogs(containerId: string, tail?: number): Promise<string> {
  const container = docker.getContainer(containerId);
  
  const logs = await container.logs({
    stdout: true,
    stderr: true,
    tail: tail || 100,
    follow: false,
  });
  
  // Docker logs come as a Buffer with multiplexed stdout/stderr
  // For simplicity, just convert to string
  return logs.toString('utf-8');
}

/**
 * Check if a container is still running.
 */
export async function isContainerRunning(containerId: string): Promise<boolean> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Running;
  } catch {
    return false;
  }
}

/**
 * Get container exit code (null if still running).
 */
export async function getContainerExitCode(containerId: string): Promise<number | null> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    if (info.State.Running) {
      return null;
    }
    return info.State.ExitCode;
  } catch {
    return null;
  }
}

/**
 * Stop a running container.
 */
export async function stopContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.stop();
}

/**
 * Remove a container (for cleanup).
 */
export async function removeContainer(containerId: string): Promise<void> {
  const container = docker.getContainer(containerId);
  await container.remove({ force: true });
}

/**
 * List all squire containers.
 */
export async function listSquireContainers(): Promise<Docker.ContainerInfo[]> {
  const containers = await docker.listContainers({
    all: true,
    filters: {
      label: ['squire.task.id'],
    },
  });
  return containers;
}
