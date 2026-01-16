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
export {
  createBackend,
  getBackend,
  setBackend,
  resetBackend,
  isDockerBackend,
  isKubernetesBackend,
} from './worker/backend.js';

export { DockerBackend, createDockerBackend } from './worker/docker.js';
export { KubernetesBackend, createKubernetesBackend } from './worker/kubernetes.js';

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
