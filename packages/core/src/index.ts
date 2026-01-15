// Types
export * from './types/task.js';

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
} from './task/limits.js';

// Container management
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
  getLogLevel,
  type LogLevel,
  type LogEntry,
} from './utils/logger.js';
