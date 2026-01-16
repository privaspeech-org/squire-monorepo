// Types
export * from './types/task.js';

// Worker backend types
export type {
  BackendType,
  WorkerBackend,
  StartTaskOptions,
  WorkerTaskInfo,
  BackendConfig,
  KubernetesBackendConfig,
  DockerBackendConfig,
} from './worker/types.js';

// Task management
export {
  createTask,
  getTask,
  updateTask,
  listTasks,
  deleteTask,
  setTasksDir,
  getTasksDir,
} from './task/store.js';

export {
  countRunningTasks,
  canStartNewTask,
  waitForSlot,
  syncTaskStatus,
} from './task/limits.js';

// Worker backend management
// NOTE: Backend implementations (DockerBackend, KubernetesBackend) are NOT exported
// directly to avoid pulling in dockerode/@kubernetes/client-node at module load time.
// Use createBackend() or getBackend() which load implementations lazily.
// For direct access, import from './worker/docker.js' or './worker/kubernetes.js'.
export {
  createBackend,
  getBackend,
  setBackend,
  resetBackend,
  isDockerBackend,
  isKubernetesBackend,
} from './worker/backend.js';

// Container management (backward compatibility)
export {
  startTaskContainer,
  getContainerLogs,
  isContainerRunning,
  getContainerExitCode,
  stopContainer,
  removeContainer,
  listSquireContainers,
  type ContainerOptions,
} from './worker/container.js';

// Logger utilities
export {
  debug,
  info,
  warn,
  error,
  createLogger,
  setLogLevel,
  setVerbose,
  setQuiet,
  getLogLevel,
  type LogLevel,
  type LogEntry,
} from './utils/logger.js';
