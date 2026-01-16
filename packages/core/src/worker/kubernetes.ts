/**
 * Kubernetes Worker Backend
 *
 * Implements the WorkerBackend interface using Kubernetes Jobs.
 * This is the production backend for running Squire workers in a K8s cluster.
 */

import * as k8s from '@kubernetes/client-node';
import type { WorkerBackend, StartTaskOptions, WorkerTaskInfo, KubernetesBackendConfig } from './types.js';
import { updateTask, getTasksDir } from '../task/store.js';
import { debug, info, warn, error as logError, audit } from '../utils/logger.js';

const DEFAULT_NAMESPACE = 'squire';
const DEFAULT_WORKER_IMAGE = 'ghcr.io/privaspeech-org/squire-worker:latest';
const DEFAULT_ACTIVE_DEADLINE_SECONDS = 1800; // 30 minutes
const DEFAULT_TTL_SECONDS_AFTER_FINISHED = 3600; // 1 hour
const DEFAULT_BACKOFF_LIMIT = 3;
const DEFAULT_CPU_REQUEST = '500m';
const DEFAULT_CPU_LIMIT = '2';
const DEFAULT_MEMORY_REQUEST = '1Gi';
const DEFAULT_MEMORY_LIMIT = '4Gi';

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a valid K8s Job name from a task ID.
 * K8s names must be lowercase, alphanumeric, and can include hyphens.
 */
function generateJobName(taskId: string): string {
  // Sanitize task ID for K8s naming conventions
  const sanitized = taskId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `squire-worker-${sanitized}`.slice(0, 63); // K8s name limit
}

/**
 * Kubernetes implementation of the WorkerBackend interface.
 */
export class KubernetesBackend implements WorkerBackend {
  readonly name = 'kubernetes' as const;
  private batchApi: k8s.BatchV1Api;
  private coreApi: k8s.CoreV1Api;
  private config: Required<Pick<KubernetesBackendConfig,
    'namespace' | 'activeDeadlineSeconds' | 'ttlSecondsAfterFinished' | 'backoffLimit'
  >> & KubernetesBackendConfig;

  constructor(config?: KubernetesBackendConfig) {
    // Load kubeconfig
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault(); // Loads from KUBECONFIG env var, ~/.kube/config, or in-cluster

    this.batchApi = kc.makeApiClient(k8s.BatchV1Api);
    this.coreApi = kc.makeApiClient(k8s.CoreV1Api);

    this.config = {
      namespace: config?.namespace || process.env.SQUIRE_NAMESPACE || DEFAULT_NAMESPACE,
      activeDeadlineSeconds: config?.activeDeadlineSeconds ?? DEFAULT_ACTIVE_DEADLINE_SECONDS,
      ttlSecondsAfterFinished: config?.ttlSecondsAfterFinished ?? DEFAULT_TTL_SECONDS_AFTER_FINISHED,
      backoffLimit: config?.backoffLimit ?? DEFAULT_BACKOFF_LIMIT,
      ...config,
    };

    info('kubernetes', 'Kubernetes backend initialized', {
      namespace: this.config.namespace,
    });
  }

  /**
   * Monitor Job execution and update task status when it completes.
   * This runs in the background.
   */
  private async monitorJobAndUpdateTask(
    jobName: string,
    taskId: string,
    timeoutMinutes: number
  ): Promise<void> {
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const startTime = Date.now();
    const pollInterval = 10000; // Check every 10 seconds (K8s is slower than Docker)

    debug('kubernetes', 'Starting Job monitoring', {
      taskId,
      jobName,
      timeoutMinutes,
    });

    while (Date.now() - startTime < timeoutMs) {
      try {
        const running = await this.isTaskRunning(jobName);

        if (!running) {
          // Job completed, check exit code
          const exitCode = await this.getTaskExitCode(jobName);
          const success = exitCode === 0;

          info('kubernetes', 'Job finished', {
            taskId,
            jobName,
            exitCode,
            success,
          });

          // Update task status
          await updateTask(taskId, {
            status: success ? 'completed' : 'failed',
            completedAt: new Date().toISOString(),
            error: success ? undefined : `Job failed with exit code ${exitCode}`,
          });

          return;
        }

        await sleep(pollInterval);
      } catch (err) {
        logError('kubernetes', 'Error monitoring Job', {
          taskId,
          jobName,
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

    // Timeout reached (should be handled by activeDeadlineSeconds, but just in case)
    warn('kubernetes', 'Job monitoring timeout', {
      taskId,
      jobName,
      timeoutMinutes,
    });

    // Try to delete the Job
    try {
      await this.stopTask(jobName);
    } catch (err) {
      warn('kubernetes', 'Failed to stop Job after timeout', {
        taskId,
        jobName,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Update task as failed due to timeout
    await updateTask(taskId, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: `Task timed out after ${timeoutMinutes} minutes`,
    });
  }

  async startTask(options: StartTaskOptions): Promise<string> {
    const { task, githubToken, model, workerImage, containerConfig } = options;
    const image = workerImage || process.env.SQUIRE_WORKER_IMAGE || DEFAULT_WORKER_IMAGE;

    // Apply container config
    const timeoutMinutes = containerConfig?.timeoutMinutes ?? Math.floor(this.config.activeDeadlineSeconds / 60);
    const cpuLimit = containerConfig?.cpuLimit ?? 2;
    const memoryLimitMB = containerConfig?.memoryLimitMB ?? 4096;

    const jobName = generateJobName(task.id);
    const retryCount = task.retryCount || 0;

    // Security audit log
    audit('kubernetes', 'job_create_requested', {
      taskId: task.id,
      jobName,
      repo: task.repo,
      branch: task.branch,
      githubTokenPresent: !!githubToken,
      cpuLimit,
      memoryLimitMB,
      timeoutMinutes,
    });

    info('kubernetes', 'Creating Job for task', {
      taskId: task.id,
      jobName,
      repo: task.repo,
      branch: task.branch,
      retryCount,
    });

    // Build the Job spec
    const jobSpec: k8s.V1Job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: this.config.namespace,
        labels: {
          'app.kubernetes.io/name': 'squire-worker',
          'app.kubernetes.io/component': 'worker',
          'app.kubernetes.io/managed-by': 'squire',
          'squire.task.id': task.id,
          'squire.repo': task.repo.replace(/[^a-zA-Z0-9.-]/g, '-').slice(0, 63),
        },
      },
      spec: {
        activeDeadlineSeconds: this.config.activeDeadlineSeconds,
        ttlSecondsAfterFinished: this.config.ttlSecondsAfterFinished,
        backoffLimit: this.config.backoffLimit,
        template: {
          metadata: {
            labels: {
              'app.kubernetes.io/name': 'squire-worker',
              'app.kubernetes.io/component': 'worker',
              'squire.task.id': task.id,
            },
          },
          spec: {
            restartPolicy: 'Never',
            serviceAccountName: this.config.serviceAccountName || 'squire-worker',
            ...(this.config.imagePullSecrets && {
              imagePullSecrets: this.config.imagePullSecrets.map(name => ({ name })),
            }),
            ...(this.config.nodeSelector && {
              nodeSelector: this.config.nodeSelector,
            }),
            ...(this.config.tolerations && {
              tolerations: this.config.tolerations,
            }),
            containers: [
              {
                name: 'worker',
                image,
                env: [
                  { name: 'TASK_ID', value: task.id },
                  { name: 'REPO', value: task.repo },
                  { name: 'PROMPT', value: task.prompt },
                  { name: 'BRANCH', value: task.branch || '' },
                  { name: 'BASE_BRANCH', value: task.baseBranch || 'main' },
                  { name: 'MODEL', value: model || 'opencode/glm-4.7-free' },
                  // GitHub token from secret
                  {
                    name: 'GITHUB_TOKEN',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'squire-github-token',
                        key: 'token',
                      },
                    },
                  },
                  {
                    name: 'GH_TOKEN',
                    valueFrom: {
                      secretKeyRef: {
                        name: 'squire-github-token',
                        key: 'token',
                      },
                    },
                  },
                ],
                resources: {
                  requests: {
                    cpu: DEFAULT_CPU_REQUEST,
                    memory: DEFAULT_MEMORY_REQUEST,
                  },
                  limits: {
                    cpu: String(cpuLimit),
                    memory: `${memoryLimitMB}Mi`,
                  },
                },
                volumeMounts: [
                  {
                    name: 'tasks',
                    mountPath: '/tasks',
                  },
                ],
              },
            ],
            volumes: [
              {
                name: 'tasks',
                persistentVolumeClaim: {
                  claimName: this.config.tasksPvcName || 'squire-tasks',
                },
              },
            ],
          },
        },
      },
    };

    try {
      // Create the Job
      const response = await this.batchApi.createNamespacedJob({
        namespace: this.config.namespace,
        body: jobSpec,
      });

      const createdJobName = response.metadata?.name || jobName;

      // Update task with Job name (using containerId field for compatibility)
      await updateTask(task.id, {
        status: 'running',
        containerId: createdJobName, // Store Job name in containerId for compatibility
        startedAt: new Date().toISOString(),
        retryCount,
      });

      // Security audit log for successful Job creation
      audit('kubernetes', 'job_created', {
        taskId: task.id,
        jobName: createdJobName,
        image,
      });

      info('kubernetes', 'Job created', {
        taskId: task.id,
        jobName: createdJobName,
      });

      // Start background monitoring
      this.monitorJobAndUpdateTask(
        createdJobName,
        task.id,
        timeoutMinutes
      ).catch(err => {
        logError('kubernetes', 'Background monitoring failed', {
          taskId: task.id,
          jobName: createdJobName,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return createdJobName;
    } catch (err) {
      logError('kubernetes', 'Failed to create Job', {
        taskId: task.id,
        jobName,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async getTaskLogs(workerId: string, tail?: number): Promise<string> {
    debug('kubernetes', 'Fetching Job logs', {
      jobName: workerId,
      tail,
    });

    try {
      // Get pods for this Job
      const podsResponse = await this.coreApi.listNamespacedPod({
        namespace: this.config.namespace,
        labelSelector: `job-name=${workerId}`,
      });

      const pods = podsResponse.items;
      if (pods.length === 0) {
        return 'No pods found for Job';
      }

      // Get logs from the first (and usually only) pod
      const podName = pods[0].metadata?.name;
      if (!podName) {
        return 'Pod name not found';
      }

      const logsResponse = await this.coreApi.readNamespacedPodLog({
        name: podName,
        namespace: this.config.namespace,
        container: 'worker',
        tailLines: tail,
      });

      debug('kubernetes', 'Job logs retrieved', {
        jobName: workerId,
        podName,
        logLength: logsResponse?.length || 0,
      });

      return logsResponse || '';
    } catch (err) {
      warn('kubernetes', 'Failed to get Job logs', {
        jobName: workerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return `Error getting logs: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async isTaskRunning(workerId: string): Promise<boolean> {
    try {
      const response = await this.batchApi.readNamespacedJob({
        name: workerId,
        namespace: this.config.namespace,
      });

      const status = response.status;
      if (!status) {
        return true; // Assume running if no status yet
      }

      // Job is running if it's not completed and not failed
      const succeeded = status.succeeded || 0;
      const failed = status.failed || 0;
      const active = status.active || 0;

      return active > 0 && succeeded === 0 && failed === 0;
    } catch (err) {
      // Job not found or error
      debug('kubernetes', 'Error checking Job status', {
        jobName: workerId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  async getTaskExitCode(workerId: string): Promise<number | null> {
    try {
      const response = await this.batchApi.readNamespacedJob({
        name: workerId,
        namespace: this.config.namespace,
      });

      const status = response.status;
      if (!status) {
        return null;
      }

      // Check if succeeded
      if ((status.succeeded || 0) > 0) {
        return 0;
      }

      // Check if failed
      if ((status.failed || 0) > 0) {
        // Try to get the actual exit code from pod
        const podsResponse = await this.coreApi.listNamespacedPod({
          namespace: this.config.namespace,
          labelSelector: `job-name=${workerId}`,
        });

        const pods = podsResponse.items;
        for (const pod of pods) {
          const containerStatuses = pod.status?.containerStatuses || [];
          for (const cs of containerStatuses) {
            if (cs.state?.terminated?.exitCode !== undefined) {
              return cs.state.terminated.exitCode;
            }
          }
        }

        return 1; // Generic failure code if we can't get specific exit code
      }

      // Still running
      return null;
    } catch {
      return null;
    }
  }

  async stopTask(workerId: string): Promise<void> {
    audit('kubernetes', 'job_delete_requested', {
      jobName: workerId,
    });

    info('kubernetes', 'Deleting Job', {
      jobName: workerId,
    });

    try {
      await this.batchApi.deleteNamespacedJob({
        name: workerId,
        namespace: this.config.namespace,
        propagationPolicy: 'Background', // Delete pods in background
      });

      audit('kubernetes', 'job_deleted', {
        jobName: workerId,
      });

      info('kubernetes', 'Job deleted', {
        jobName: workerId,
      });
    } catch (err) {
      warn('kubernetes', 'Failed to delete Job', {
        jobName: workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async removeTask(workerId: string): Promise<void> {
    // In K8s, stopTask already removes the Job
    // TTL controller will also clean up finished Jobs
    await this.stopTask(workerId);
  }

  async listTasks(): Promise<WorkerTaskInfo[]> {
    try {
      const response = await this.batchApi.listNamespacedJob({
        namespace: this.config.namespace,
        labelSelector: 'app.kubernetes.io/managed-by=squire',
      });

      const jobs = response.items;

      debug('kubernetes', 'Listed squire Jobs', { count: jobs.length });

      return jobs.map(job => {
        const status = job.status;
        const active = status?.active || 0;
        const succeeded = status?.succeeded || 0;
        const failed = status?.failed || 0;

        let exitCode: number | null = null;
        if (succeeded > 0) {
          exitCode = 0;
        } else if (failed > 0) {
          exitCode = 1;
        }

        return {
          taskId: job.metadata?.labels?.['squire.task.id'] || '',
          workerId: job.metadata?.name || '',
          running: active > 0 && succeeded === 0 && failed === 0,
          exitCode,
          repo: job.metadata?.labels?.['squire.repo']?.replace(/-/g, '/'),
          createdAt: job.metadata?.creationTimestamp?.toISOString(),
        };
      });
    } catch (err) {
      warn('kubernetes', 'Failed to list Jobs', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
}

/**
 * Create a Kubernetes backend instance.
 */
export function createKubernetesBackend(config?: KubernetesBackendConfig): KubernetesBackend {
  return new KubernetesBackend(config);
}
