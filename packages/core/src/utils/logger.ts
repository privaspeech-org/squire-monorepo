export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, unknown>;
}

let currentLogLevel: LogLevel = 'info';
let verboseMode = false;
let quietMode = false;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
  if (enabled) {
    currentLogLevel = 'debug';
    quietMode = false;
  }
}

export function setQuiet(enabled: boolean): void {
  quietMode = enabled;
}

export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  if (quietMode) {
    return false;
  }
  const levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };
  return levels[level] >= levels[currentLogLevel];
}

function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

function log(level: LogLevel, component: string, message: string, metadata?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    metadata,
  };

  process.stdout.write(formatLogEntry(entry) + '\n');
}

export function debug(component: string, message: string, metadata?: Record<string, unknown>): void {
  log('debug', component, message, metadata);
}

export function info(component: string, message: string, metadata?: Record<string, unknown>): void {
  log('info', component, message, metadata);
}

export function warn(component: string, message: string, metadata?: Record<string, unknown>): void {
  log('warn', component, message, metadata);
}

export function error(component: string, message: string, metadata?: Record<string, unknown>): void {
  log('error', component, message, metadata);
}

export function createLogger(component: string) {
  return {
    debug: (message: string, metadata?: Record<string, unknown>) => debug(component, message, metadata),
    info: (message: string, metadata?: Record<string, unknown>) => info(component, message, metadata),
    warn: (message: string, metadata?: Record<string, unknown>) => warn(component, message, metadata),
    error: (message: string, metadata?: Record<string, unknown>) => error(component, message, metadata),
  };
}
