import Docker from 'dockerode';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Task, ContainerConfig } from '../types/task.js';
import { updateTask, getTasksDir } from '../task/store.js';
import { debug, info, warn, error as logError, audit } from '../utils/logger.js';

/**
 * Create Docker client with auto-detection for podman.
 * Priority:
 * 1. DOCKER_HOST environment variable
 * 2. Podman user socket (rootless)
 * 3. Default Docker socket
 */
function createDockerClient(): Docker {
  // If DOCKER_HOST is set, use it
  if (process.env.DOCKER_HOST) {
    debug('container', 'Using DOCKER_HOST', { host: process.env.DOCKER_HOST });
    return new Docker();
  }

  // Try podman user socket (rootless podman)
  const uid = process.getuid?.() ?? 1000;
  const podmanSocket = `/run/user/${uid}/podman/podman.sock`;
  if (existsSync(podmanSocket)) {
    debug('container', 'Auto-detected podman socket', { socket: podmanSocket });
    return new Docker({ socketPath: podmanSocket });
  }

  // Try system-wide podman socket
  const podmanSystemSocket = '/run/podman/podman.sock';
  if (existsSync(podmanSystemSocket)) {
    debug('container', 'Auto-detected system podman socket', { socket: podmanSystemSocket });
    return new Docker({ socketPath: podmanSystemSocket });
  }

  // Fall back to default Docker
  debug('container', 'Using default Docker socket');
  return new Docker();
}

const docker = createDockerClient();

const DEFAULT_WORKER_IMAGE = 'squire-worker:latest';
const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CPU_LIMIT = 2;
const DEFAULT_MEMORY_LIMIT_MB = 4096;
const DEFAULT_PRESERVE_LOGS = true;

export interface ContainerOptions {
  task: Task;
  githubToken: string;
  model?: string;
  verbose?: boolean;
  workerImage?: string;
  containerConfig?: ContainerConfig;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay for retry attempts.
 */
function calculateBackoffDelay(retryCount: number): number {
  // Exponential backoff: 2^retryCount seconds, capped at 60 seconds
  const baseDelay = Math.min(Math.pow(2, retryCount) * 1000, 60000);
  // Add jitter (±20%)
  const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
  return Math.floor(baseDelay + jitter);
}

/**
 * Preserve container logs to disk before cleanup.
 */
async function preserveContainerLogs(containerId: string, taskId: string): Promise<void> {
  try {
    const logsDir = join(getTasksDir(), '../logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    const logPath = join(logsDir, `${taskId}.log`);
    const logs = await getContainerLogs(containerId, undefined);

    writeFileSync(logPath, logs, 'utf-8');
    info('container', 'Container logs preserved', {
      taskId,
      logPath,
      containerId: containerId.slice(0, 12),
    });
  } catch (err) {
    warn('container', 'Failed to preserve container logs', {
      taskId,
      containerId: containerId.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Monitor container execution with timeout and update task status on completion.
 * This runs in the background and updates the task file when the container exits.
 */
async function monitorContainerAndUpdateTask(
  containerId: string,
  taskId: string,
  timeoutMinutes: number,
  preserveLogsOnFailure: boolean
): Promise<void> {
  const timeoutMs = timeoutMinutes * 60 * 1000;
  const startTime = Date.now();
  const pollInterval = 5000; // Check every 5 seconds

  debug('container', 'Starting container monitoring', {
    taskId,
    containerId: containerId.slice(0, 12),
    timeoutMinutes,
  });

  let timedOut = false;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const running = await isContainerRunning(containerId);

      if (!running) {
        // Container stopped, check exit code and update task
        const exitCode = await getContainerExitCode(containerId);
        const success = exitCode === 0;

        info('container', 'Container finished', {
          taskId,
          containerId: containerId.slice(0, 12),
          exitCode,
          success,
        });

        // Update task status
        await updateTask(taskId, {
          status: success ? 'completed' : 'failed',
          completedAt: new Date().toISOString(),
          error: success ? undefined : `Container exited with code ${exitCode}`,
        });

        // Preserve logs on failure if configured
        if (!success && preserveLogsOnFailure) {
          await preserveContainerLogs(containerId, taskId);
        }

        return;
      }

      await sleep(pollInterval);
    } catch (err) {
      logError('container', 'Error monitoring container', {
        taskId,
        containerId: containerId.slice(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });

      // Update task as failed on monitoring error
      await updateTask(taskId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: `Monitoring error: ${err instanceof Error ? err.message : String(err)}`,
      });

      return;
    }
  }

  // Timeout reached
  timedOut = true;
  warn('container', 'Container execution timeout', {
    taskId,
    containerId: containerId.slice(0, 12),
    timeoutMinutes,
  });

  // Stop the container
  try {
    await stopContainer(containerId);
  } catch (err) {
    warn('container', 'Failed to stop container after timeout', {
      taskId,
      containerId: containerId.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Update task as failed due to timeout
  await updateTask(taskId, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    error: `Task timed out after ${timeoutMinutes} minutes`,
  });

  // Preserve logs on timeout
  if (preserveLogsOnFailure) {
    await preserveContainerLogs(containerId, taskId);
  }
}

/**
 * Check if an error is transient and should be retried.
 */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const message = err.message.toLowerCase();
  const transientPatterns = [
    'econnrefused',
    'enotfound',
    'etimedout',
    'socket hang up',
    'network error',
    'no such container',
    'container is restarting',
    'oom killed',
  ];

  return transientPatterns.some(pattern => message.includes(pattern));
}

/**
 * Start a container to execute a task with retry logic and timeout enforcement.
 * The container runs async (detached) and updates the task file on completion.
 */
export async function startTaskContainer(options: ContainerOptions): Promise<string> {
  const { task, githubToken, model, verbose, workerImage, containerConfig } = options;
  const image = workerImage || process.env.SQUIRE_WORKER_IMAGE || DEFAULT_WORKER_IMAGE;

  // Apply defaults to container config
  const config: Required<ContainerConfig> = {
    timeoutMinutes: containerConfig?.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES,
    maxRetries: containerConfig?.maxRetries ?? DEFAULT_MAX_RETRIES,
    cpuLimit: containerConfig?.cpuLimit ?? DEFAULT_CPU_LIMIT,
    memoryLimitMB: containerConfig?.memoryLimitMB ?? DEFAULT_MEMORY_LIMIT_MB,
    preserveLogsOnFailure: containerConfig?.preserveLogsOnFailure ?? DEFAULT_PRESERVE_LOGS,
  };

  const retryCount = task.retryCount || 0;

  // Security audit log for container start with GitHub token access
  audit('container', 'container_start_requested', {
    taskId: task.id,
    repo: task.repo,
    branch: task.branch,
    githubTokenPresent: !!githubToken,
    cpuLimit: config.cpuLimit,
    memoryLimitMB: config.memoryLimitMB,
    timeoutMinutes: config.timeoutMinutes,
  });

  info('container', 'Starting task container', {
    taskId: task.id,
    repo: task.repo,
    branch: task.branch,
    retryCount,
    timeoutMinutes: config.timeoutMinutes,
  });

  let lastError: Error | null = null;

  // Retry loop with exponential backoff
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Environment variables for the worker
      const env = [
        `TASK_ID=${task.id}`,
        `REPO=${task.repo}`,
        `PROMPT=${task.prompt}`,
        `BRANCH=${task.branch}`,
        `BASE_BRANCH=${task.baseBranch || 'main'}`,
        `GITHUB_TOKEN=${githubToken}`,
        `GH_TOKEN=${githubToken}`,
        `MODEL=${model || 'opencode/glm-4.7-free'}`,
      ];

      // Mount tasks directory so container can update task status
      const tasksDir = getTasksDir();

      // Create container with resource limits
      const container = await docker.createContainer({
        Image: image,
        Env: env,
        HostConfig: {
          Binds: [
            `${tasksDir}:/tasks:rw`,
          ],
          AutoRemove: false,
          // Resource limits
          Memory: config.memoryLimitMB * 1024 * 1024, // Convert MB to bytes
          NanoCpus: config.cpuLimit * 1e9, // Convert cores to nanocpus
        },
        Labels: {
          'squire.task.id': task.id,
          'squire.repo': task.repo,
          'squire.retry': String(retryCount),
        },
      });

      debug('container', 'Container created', {
        taskId: task.id,
        containerId: container.id,
        image,
        cpuLimit: config.cpuLimit,
        memoryLimitMB: config.memoryLimitMB,
        attempt: attempt + 1,
      });

      // Start the container (async, detached)
      await container.start();

      const containerId = container.id;

      // Update task with container ID and status
      await updateTask(task.id, {
        status: 'running',
        containerId,
        startedAt: new Date().toISOString(),
        retryCount,
        lastRetryAt: attempt > 0 ? new Date().toISOString() : undefined,
      });

      // Security audit log for successful container start
      audit('container', 'container_started', {
        taskId: task.id,
        containerId: containerId.slice(0, 12),
        image,
        attempt: attempt + 1,
      });

      info('container', 'Container started', {
        taskId: task.id,
        containerId: containerId.slice(0, 12),
        attempt: attempt + 1,
      });

      if (verbose) {
        debug('container', 'Container started (verbose)', {
          taskId: task.id,
          fullContainerId: containerId,
        });
      }

      // Start background monitoring to update task status when container exits
      // This runs async and doesn't block the return
      monitorContainerAndUpdateTask(
        containerId,
        task.id,
        config.timeoutMinutes,
        config.preserveLogsOnFailure
      ).catch(err => {
        logError('container', 'Background monitoring failed', {
          taskId: task.id,
          containerId: containerId.slice(0, 12),
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return containerId;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if error is transient and we should retry
      if (isTransientError(err) && attempt < config.maxRetries) {
        const delay = calculateBackoffDelay(attempt);
        warn('container', 'Container start failed, retrying', {
          taskId: task.id,
          attempt: attempt + 1,
          maxRetries: config.maxRetries,
          error: lastError.message,
          retryDelayMs: delay,
        });

        // Update retry count
        await updateTask(task.id, {
          retryCount: retryCount + 1,
          lastRetryAt: new Date().toISOString(),
        });

        await sleep(delay);
        continue;
      }

      // Non-transient error or max retries reached
      logError('container', 'Container start failed', {
        taskId: task.id,
        attempt: attempt + 1,
        error: lastError.message,
      });

      throw lastError;
    }
  }

  // Should not reach here, but throw last error if we do
  throw lastError || new Error('Container start failed for unknown reason');
}

/**
 * Get logs from a task's container.
 */
export async function getContainerLogs(containerId: string, tail?: number): Promise<string> {
  debug('container', 'Fetching container logs', {
    containerId: containerId.slice(0, 12),
    tail,
  });

  const container = docker.getContainer(containerId);

  const logsOptions: Docker.ContainerLogsOptions & { follow: false } = {
    stdout: true,
    stderr: true,
    follow: false,
  };

  // Only add tail if specified, otherwise get all logs
  if (tail !== undefined) {
    logsOptions.tail = tail;
  }

  const logs = await container.logs(logsOptions);

  debug('container', 'Container logs retrieved', {
    containerId: containerId.slice(0, 12),
    logLength: logs.length,
  });

  return logs.toString();
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
  audit('container', 'container_stop_requested', {
    containerId: containerId.slice(0, 12),
  });

  // Check if container is still running before trying to stop
  const running = await isContainerRunning(containerId);
  if (!running) {
    info('container', 'Container already stopped', {
      containerId: containerId.slice(0, 12),
    });
    return;
  }

  info('container', 'Stopping container', {
    containerId: containerId.slice(0, 12),
  });

  const container = docker.getContainer(containerId);
  await container.stop();

  audit('container', 'container_stopped', {
    containerId: containerId.slice(0, 12),
  });

  info('container', 'Container stopped', {
    containerId: containerId.slice(0, 12),
  });
}

/**
 * Remove a container (for cleanup).
 * Optionally preserves logs before removal.
 */
export async function removeContainer(
  containerId: string,
  options?: { preserveLogs?: boolean; taskId?: string }
): Promise<void> {
  info('container', 'Removing container', {
    containerId: containerId.slice(0, 12),
    preserveLogs: options?.preserveLogs,
  });

  // Preserve logs if requested
  if (options?.preserveLogs && options?.taskId) {
    await preserveContainerLogs(containerId, options.taskId);
  }

  try {
    const container = docker.getContainer(containerId);
    await container.remove({ force: true });

    audit('container', 'container_removed', {
      containerId: containerId.slice(0, 12),
      taskId: options?.taskId,
    });

    debug('container', 'Container removed', {
      containerId: containerId.slice(0, 12),
    });
  } catch (err) {
    // Container might already be removed, log but don't throw
    warn('container', 'Failed to remove container', {
      containerId: containerId.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Cleanup container with safety checks.
 * Preserves logs on failure if configured.
 */
export async function cleanupContainer(
  containerId: string,
  taskId: string,
  preserveLogsOnFailure: boolean = true
): Promise<void> {
  try {
    // Check if container failed
    const exitCode = await getContainerExitCode(containerId);
    const failed = exitCode !== null && exitCode !== 0;

    if (failed && preserveLogsOnFailure) {
      await preserveContainerLogs(containerId, taskId);
    }

    // Remove the container
    await removeContainer(containerId, {
      preserveLogs: false, // Already preserved if needed
      taskId,
    });
  } catch (err) {
    warn('container', 'Failed to cleanup container', {
      taskId,
      containerId: containerId.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }
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

  debug('container', 'Listed squire containers', { count: containers.length });
  return containers;
}
