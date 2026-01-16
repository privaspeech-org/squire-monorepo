/**
 * Worker Backend Factory
 *
 * Provides a unified interface for creating and accessing worker backends.
 * The backend is selected based on the SQUIRE_BACKEND environment variable
 * or explicit configuration.
 *
 * IMPORTANT: Backend implementations are loaded lazily via dynamic import
 * to avoid pulling in dockerode/kubernetes-client-node at module load time.
 * This allows the code to be bundled in environments where these dependencies
 * aren't available (e.g., Next.js build).
 */

import type { WorkerBackend, BackendConfig, BackendType } from './types.js';
import { debug, info } from '../utils/logger.js';

// Singleton backend instance
let currentBackend: WorkerBackend | null = null;

/**
 * Detect the backend type from environment variables.
 */
function detectBackendType(): BackendType {
  const envBackend = process.env.SQUIRE_BACKEND?.toLowerCase();

  if (envBackend === 'kubernetes' || envBackend === 'k8s') {
    return 'kubernetes';
  }

  if (envBackend === 'docker' || envBackend === 'podman') {
    return 'docker';
  }

  // Auto-detect: if KUBERNETES_SERVICE_HOST is set, we're in a K8s cluster
  if (process.env.KUBERNETES_SERVICE_HOST) {
    debug('backend', 'Auto-detected Kubernetes environment');
    return 'kubernetes';
  }

  // Default to Docker
  return 'docker';
}

/**
 * Create a worker backend based on configuration.
 * Uses dynamic imports to avoid loading backend dependencies at module load time.
 *
 * @param config - Backend configuration (optional, will use env vars if not provided)
 * @returns A WorkerBackend implementation
 */
export async function createBackend(config?: BackendConfig): Promise<WorkerBackend> {
  const backendType = config?.type || detectBackendType();

  info('backend', 'Creating worker backend', { type: backendType });

  switch (backendType) {
    case 'kubernetes': {
      const { createKubernetesBackend } = await import('./kubernetes.js');
      return createKubernetesBackend(config?.kubernetes);
    }
    case 'docker':
    default: {
      const { createDockerBackend } = await import('./docker.js');
      return createDockerBackend(config?.docker);
    }
  }
}

/**
 * Get the current global backend instance.
 * Creates a new instance if one doesn't exist.
 *
 * @param config - Optional configuration to use when creating the backend
 * @returns The current WorkerBackend instance
 */
export async function getBackend(config?: BackendConfig): Promise<WorkerBackend> {
  if (!currentBackend) {
    currentBackend = await createBackend(config);
  }
  return currentBackend;
}

/**
 * Set the global backend instance.
 * Useful for testing or when you want to use a specific backend.
 *
 * @param backend - The backend instance to use
 */
export function setBackend(backend: WorkerBackend): void {
  currentBackend = backend;
  info('backend', 'Backend set explicitly', { type: backend.name });
}

/**
 * Reset the global backend instance.
 * Primarily useful for testing.
 */
export function resetBackend(): void {
  currentBackend = null;
  debug('backend', 'Backend reset');
}

/**
 * Check if a backend is Docker-based.
 */
export function isDockerBackend(backend: WorkerBackend): boolean {
  return backend.name === 'docker';
}

/**
 * Check if a backend is Kubernetes-based.
 */
export function isKubernetesBackend(backend: WorkerBackend): boolean {
  return backend.name === 'kubernetes';
}
