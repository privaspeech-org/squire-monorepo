/**
 * Docker Worker Backend
 *
 * Implements the WorkerBackend interface using Docker/Podman containers.
 * This is the default backend for local development.
 */

import Docker from 'dockerode';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkerBackend, StartTaskOptions, WorkerTaskInfo, DockerBackendConfig } from './types.js';
import { updateTask, getTasksDir } from '../task/store.js';
import { debug, info, warn, error as logError, audit } from '../utils/logger.js';

const DEFAULT_WORKER_IMAGE = 'squire-worker:latest';
const DEFAULT_TIMEOUT_MINUTES = 30;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CPU_LIMIT = 2;
const DEFAULT_MEMORY_LIMIT_MB = 4096;
const DEFAULT_PRESERVE_LOGS = true;

/**
 * Create Docker client with auto-detection for podman.
 * Priority:
 * 1. DOCKER_HOST environment variable
 * 2. Explicit socket path from config
 * 3. Podman user socket (rootless)
 * 4. Default Docker socket
 */
function createDockerClient(config?: DockerBackendConfig): Docker {
  // If explicit socket path provided, use it
  if (config?.socketPath) {
    debug('docker', 'Using explicit socket path', { socket: config.socketPath });
    return new Docker({ socketPath: config.socketPath });
  }

  // If DOCKER_HOST is set, use it
  if (process.env.DOCKER_HOST) {
    debug('docker', 'Using DOCKER_HOST', { host: process.env.DOCKER_HOST });
    return new Docker();
  }

  // Try podman user socket (rootless podman)
  const uid = process.getuid?.() ?? 1000;
  const podmanSocket = `/run/user/${uid}/podman/podman.sock`;
  if (existsSync(podmanSocket)) {
    debug('docker', 'Auto-detected podman socket', { socket: podmanSocket });
    return new Docker({ socketPath: podmanSocket });
  }

  // Try system-wide podman socket
  const podmanSystemSocket = '/run/podman/podman.sock';
  if (existsSync(podmanSystemSocket)) {
    debug('docker', 'Auto-detected system podman socket', { socket: podmanSystemSocket });
    return new Docker({ socketPath: podmanSystemSocket });
  }

  // Fall back to default Docker
  debug('docker', 'Using default Docker socket');
  return new Docker();
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
  // Add jitter (+/-20%)
  const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
  return Math.floor(baseDelay + jitter);
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
 * Preserve container logs to disk before cleanup.
 */
async function preserveContainerLogs(
  docker: Docker,
  containerId: string,
  taskId: string
): Promise<void> {
  try {
    const logsDir = join(getTasksDir(), '../logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    const logPath = join(logsDir, `${taskId}.log`);
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
    });

    writeFileSync(logPath, logs.toString(), 'utf-8');
    info('docker', 'Container logs preserved', {
      taskId,
      logPath,
      containerId: containerId.slice(0, 12),
    });
  } catch (err) {
    warn('docker', 'Failed to preserve container logs', {
      taskId,
      containerId: containerId.slice(0, 12),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Docker/Podman implementation of the WorkerBackend interface.
 */
export class DockerBackend implements WorkerBackend {
  readonly name = 'docker' as const;
  private docker: Docker;
  private config: DockerBackendConfig;

  constructor(config?: DockerBackendConfig) {
    this.config = config || {};
    this.docker = createDockerClient(config);
  }

  /**
   * Monitor container execution with timeout and update task status on completion.
   * This runs in the background and updates the task file when the container exits.
   */
  private async monitorContainerAndUpdateTask(
    containerId: string,
    taskId: string,
    timeoutMinutes: number,
    preserveLogsOnFailure: boolean
  ): Promise<void> {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    debug('docker', 'Starting container monitoring', {
      taskId,
      containerId: containerId.slice(0, 12),
      timeoutMinutes,
    });

    while (Date.now() - startTime < timeoutMs) {
      try {
        const running = await this.isTaskRunning(containerId);

        if (!running) {
          // Container stopped, check exit code and update task
          const exitCode = await this.getTaskExitCode(containerId);
          const success = exitCode === 0;

          info('docker', 'Container finished', {
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
            await preserveContainerLogs(this.docker, containerId, taskId);
          }

          return;
        }

        await sleep(pollInterval);
      } catch (err) {
        logError('docker', 'Error monitoring container', {
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
    warn('docker', 'Container execution timeout', {
      taskId,
      containerId: containerId.slice(0, 12),
      timeoutMinutes,
    });

    // Stop the container
    try {
      await this.stopTask(containerId);
    } catch (err) {
      warn('docker', 'Failed to stop container after timeout', {
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
      await preserveContainerLogs(this.docker, containerId, taskId);
    }
  }

  async startTask(options: StartTaskOptions): Promise<string> {
    const { task, githubToken, model, verbose, workerImage, containerConfig } = options;
    const image = workerImage || process.env.SQUIRE_WORKER_IMAGE || DEFAULT_WORKER_IMAGE;

    // Apply defaults to container config
    const config = {
      timeoutMinutes: containerConfig?.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES,
      maxRetries: containerConfig?.maxRetries ?? DEFAULT_MAX_RETRIES,
      cpuLimit: containerConfig?.cpuLimit ?? DEFAULT_CPU_LIMIT,
      memoryLimitMB: containerConfig?.memoryLimitMB ?? DEFAULT_MEMORY_LIMIT_MB,
      preserveLogsOnFailure: containerConfig?.preserveLogsOnFailure ?? DEFAULT_PRESERVE_LOGS,
    };

    const retryCount = task.retryCount || 0;

    // Security audit log for container start with GitHub token access
    audit('docker', 'container_start_requested', {
      taskId: task.id,
      repo: task.repo,
      branch: task.branch,
      githubTokenPresent: !!githubToken,
      cpuLimit: config.cpuLimit,
      memoryLimitMB: config.memoryLimitMB,
      timeoutMinutes: config.timeoutMinutes,
    });

    info('docker', 'Starting task container', {
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

        // Build volume binds
        const binds = [`${tasksDir}:/tasks:rw`];

        // Mount skills directory if configured
        if (this.config.skillsDir) {
          binds.push(`${this.config.skillsDir}:/skills:ro`);
          debug('docker', 'Mounting skills directory', { skillsDir: this.config.skillsDir });
        }

        // Create container with resource limits
        const container = await this.docker.createContainer({
          Image: image,
          Env: env,
          HostConfig: {
            Binds: binds,
            AutoRemove: false,
            // Resource limits
            Memory: config.memoryLimitMB * 1024 * 1024, // Convert MB to bytes
            NanoCpus: config.cpuLimit * 1e9, // Convert cores to nanocpus
            NetworkMode: this.config.hostNetwork ? 'host' : undefined,
          },
          Labels: {
            'squire.task.id': task.id,
            'squire.repo': task.repo,
            'squire.retry': String(retryCount),
          },
        });

        debug('docker', 'Container created', {
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
        audit('docker', 'container_started', {
          taskId: task.id,
          containerId: containerId.slice(0, 12),
          image,
          attempt: attempt + 1,
        });

        info('docker', 'Container started', {
          taskId: task.id,
          containerId: containerId.slice(0, 12),
          attempt: attempt + 1,
        });

        if (verbose) {
          debug('docker', 'Container started (verbose)', {
            taskId: task.id,
            fullContainerId: containerId,
          });
        }

        // Start background monitoring to update task status when container exits
        // This runs async and doesn't block the return
        this.monitorContainerAndUpdateTask(
          containerId,
          task.id,
          config.timeoutMinutes,
          config.preserveLogsOnFailure
        ).catch(err => {
          logError('docker', 'Background monitoring failed', {
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
          warn('docker', 'Container start failed, retrying', {
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
        logError('docker', 'Container start failed', {
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

  async getTaskLogs(workerId: string, tail?: number): Promise<string> {
    debug('docker', 'Fetching container logs', {
      containerId: workerId.slice(0, 12),
      tail,
    });

    const container = this.docker.getContainer(workerId);

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

    debug('docker', 'Container logs retrieved', {
      containerId: workerId.slice(0, 12),
      logLength: logs.length,
    });

    return logs.toString();
  }

  async isTaskRunning(workerId: string): Promise<boolean> {
    try {
      const container = this.docker.getContainer(workerId);
      const info = await container.inspect();
      return info.State.Running;
    } catch {
      return false;
    }
  }

  async getTaskExitCode(workerId: string): Promise<number | null> {
    try {
      const container = this.docker.getContainer(workerId);
      const info = await container.inspect();
      if (info.State.Running) {
        return null;
      }
      return info.State.ExitCode;
    } catch {
      return null;
    }
  }

  async stopTask(workerId: string): Promise<void> {
    audit('docker', 'container_stop_requested', {
      containerId: workerId.slice(0, 12),
    });

    // Check if container is still running before trying to stop
    const running = await this.isTaskRunning(workerId);
    if (!running) {
      info('docker', 'Container already stopped', {
        containerId: workerId.slice(0, 12),
      });
      return;
    }

    info('docker', 'Stopping container', {
      containerId: workerId.slice(0, 12),
    });

    const container = this.docker.getContainer(workerId);
    await container.stop();

    audit('docker', 'container_stopped', {
      containerId: workerId.slice(0, 12),
    });

    info('docker', 'Container stopped', {
      containerId: workerId.slice(0, 12),
    });
  }

  async removeTask(workerId: string): Promise<void> {
    info('docker', 'Removing container', {
      containerId: workerId.slice(0, 12),
    });

    try {
      const container = this.docker.getContainer(workerId);
      await container.remove({ force: true });

      audit('docker', 'container_removed', {
        containerId: workerId.slice(0, 12),
      });

      debug('docker', 'Container removed', {
        containerId: workerId.slice(0, 12),
      });
    } catch (err) {
      // Container might already be removed, log but don't throw
      warn('docker', 'Failed to remove container', {
        containerId: workerId.slice(0, 12),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async listTasks(): Promise<WorkerTaskInfo[]> {
    const containers = await this.docker.listContainers({
      all: true,
      filters: {
        label: ['squire.task.id'],
      },
    });

    debug('docker', 'Listed squire containers', { count: containers.length });

    return containers.map(c => ({
      taskId: c.Labels['squire.task.id'] || '',
      workerId: c.Id,
      running: c.State === 'running',
      exitCode: c.State === 'exited' ? null : null, // Exit code not available in list, need inspect
      repo: c.Labels['squire.repo'],
      retryCount: parseInt(c.Labels['squire.retry'] || '0', 10),
      createdAt: new Date(c.Created * 1000).toISOString(),
    }));
  }
}

/**
 * Create a Docker backend instance.
 */
export function createDockerBackend(config?: DockerBackendConfig): DockerBackend {
  return new DockerBackend(config);
}
