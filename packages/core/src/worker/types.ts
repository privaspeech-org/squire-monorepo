/**
 * Worker Backend Types
 *
 * Provides a pluggable backend system for running Squire workers.
 * Supports both Docker (for local development) and Kubernetes (for production).
 */

import type { Task, ContainerConfig } from '../types/task.js';

/**
 * Backend type identifiers.
 */
export type BackendType = 'docker' | 'kubernetes';

/**
 * Options for starting a worker task.
 */
export interface StartTaskOptions {
  task: Task;
  githubToken: string;
  model?: string;
  workerImage?: string;
  containerConfig?: ContainerConfig;
  verbose?: boolean;
}

/**
 * Information about a running or completed worker task.
 */
export interface WorkerTaskInfo {
  /** Task ID from the Squire task */
  taskId: string;
  /** Backend-specific worker ID (container ID for Docker, Job name for K8s) */
  workerId: string;
  /** Whether the worker is currently running */
  running: boolean;
  /** Exit code if the worker has completed (null if still running) */
  exitCode: number | null;
  /** Repository the task is working on */
  repo?: string;
  /** Retry count for this task */
  retryCount?: number;
  /** When the worker was created */
  createdAt?: string;
}

/**
 * Configuration for the Kubernetes backend.
 */
export interface KubernetesBackendConfig {
  /** Kubernetes namespace to create Jobs in (default: 'squire') */
  namespace?: string;
  /** Service account name for worker Jobs */
  serviceAccountName?: string;
  /** Image pull secrets for private registries */
  imagePullSecrets?: string[];
  /** PVC name containing skills (mounted at /skills, read-only) */
  skillsPvcName?: string;
  /** Node selector for worker Jobs */
  nodeSelector?: Record<string, string>;
  /** Tolerations for worker Jobs */
  tolerations?: Array<{
    key?: string;
    operator?: string;
    value?: string;
    effect?: string;
  }>;
  /** Active deadline in seconds for Jobs (default: 1800 = 30 min) */
  activeDeadlineSeconds?: number;
  /** TTL for completed Jobs in seconds (default: 3600 = 1 hour) */
  ttlSecondsAfterFinished?: number;
  /** Max retries for Jobs (default: 3) */
  backoffLimit?: number;
  /** Path to tasks directory in the PVC */
  tasksVolumePath?: string;
  /** Name of the PVC for tasks storage */
  tasksPvcName?: string;
}

/**
 * Configuration for the Docker backend.
 */
export interface DockerBackendConfig {
  /** Docker socket path (auto-detected if not specified) */
  socketPath?: string;
  /** Whether to use host networking */
  hostNetwork?: boolean;
  /** Path to skills directory on host (mounted read-only at /skills in container) */
  skillsDir?: string;
  /** Container runtime to use (e.g., 'runsc' for gVisor sandbox isolation) */
  runtime?: string;
}

/**
 * Combined backend configuration.
 */
export interface BackendConfig {
  /** Which backend to use */
  type: BackendType;
  /** Kubernetes-specific configuration */
  kubernetes?: KubernetesBackendConfig;
  /** Docker-specific configuration */
  docker?: DockerBackendConfig;
}

/**
 * Abstract interface for worker backends.
 *
 * Implementations handle the lifecycle of worker processes/containers/jobs
 * that execute coding tasks.
 */
export interface WorkerBackend {
  /** Backend type identifier */
  readonly name: BackendType;

  /**
   * Start a worker to execute a task.
   *
   * @param options - Task and configuration options
   * @returns The worker ID (container ID for Docker, Job name for K8s)
   */
  startTask(options: StartTaskOptions): Promise<string>;

  /**
   * Get logs from a worker.
   *
   * @param workerId - Backend-specific worker identifier
   * @param tail - Number of lines to return (all if undefined)
   * @returns Log output from the worker
   */
  getTaskLogs(workerId: string, tail?: number): Promise<string>;

  /**
   * Check if a worker is still running.
   *
   * @param workerId - Backend-specific worker identifier
   * @returns true if the worker is running
   */
  isTaskRunning(workerId: string): Promise<boolean>;

  /**
   * Get the exit code of a completed worker.
   *
   * @param workerId - Backend-specific worker identifier
   * @returns Exit code, or null if still running or not found
   */
  getTaskExitCode(workerId: string): Promise<number | null>;

  /**
   * Stop a running worker.
   *
   * @param workerId - Backend-specific worker identifier
   */
  stopTask(workerId: string): Promise<void>;

  /**
   * Remove/cleanup a worker after completion.
   *
   * @param workerId - Backend-specific worker identifier
   */
  removeTask(workerId: string): Promise<void>;

  /**
   * List all Squire workers managed by this backend.
   *
   * @returns Array of worker info objects
   */
  listTasks(): Promise<WorkerTaskInfo[]>;
}
