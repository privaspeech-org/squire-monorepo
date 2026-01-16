import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceContext {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
}

let currentLogLevel: LogLevel = 'info';
let verboseMode = false;
let quietMode = false;

// AsyncLocalStorage for trace context propagation
const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * Run a function with a trace context.
 * All logs within this context will include the trace ID.
 */
export function withTraceContext<T>(fn: () => T, traceId?: string): T {
  const context: TraceContext = {
    traceId: traceId || randomUUID(),
  };
  return traceStorage.run(context, fn);
}

/**
 * Run an async function with a trace context.
 * All logs within this context will include the trace ID.
 */
export async function withTraceContextAsync<T>(fn: () => Promise<T>, traceId?: string): Promise<T> {
  const context: TraceContext = {
    traceId: traceId || randomUUID(),
  };
  return traceStorage.run(context, fn);
}

/**
 * Get the current trace context if one exists.
 */
export function getTraceContext(): TraceContext | undefined {
  return traceStorage.getStore();
}

/**
 * Get the current trace ID if one exists.
 */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

/**
 * Generate a new trace ID.
 */
export function generateTraceId(): string {
  return randomUUID();
}

/**
 * Sensitive key patterns that should be redacted in logs.
 * These patterns will match keys that contain these substrings (case-insensitive).
 * More specific patterns are checked first to avoid false positives.
 */
const SENSITIVE_KEY_PATTERNS = [
  /token/i,
  /secret/i,
  /password/i,
  /passwd/i,
  /apikey/i,
  /api[_-]key/i,
  /auth[_-]?token/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
];

/**
 * Check if a key is sensitive and should be redacted.
 * Uses pattern matching to avoid false positives.
 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Sanitize a value by redacting it if it appears to be sensitive.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    // If the string looks like a token/key (long alphanumeric), show only first/last 4 chars
    if (value.length > 20 && /^[a-zA-Z0-9_\-\.]+$/.test(value)) {
      return `${value.slice(0, 4)}...${value.slice(-4)}`;
    }
    return value;
  }
  return value;
}

/**
 * Recursively sanitize metadata to redact sensitive information.
 */
function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (isSensitiveKey(key)) {
      // Redact the entire value for sensitive keys
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Sanitize array elements
      sanitized[key] = value.map(item =>
        item && typeof item === 'object'
          ? sanitizeMetadata(item as Record<string, unknown>)
          : sanitizeValue(item)
      );
    } else {
      // Sanitize primitive values
      sanitized[key] = sanitizeValue(value);
    }
  }

  return sanitized;
}

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

  // Sanitize metadata to redact sensitive information
  const sanitizedMetadata = metadata ? sanitizeMetadata(metadata) : undefined;

  // Get trace ID from context if available
  const traceId = getTraceId();

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(traceId && { traceId }),
    metadata: sanitizedMetadata,
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
    audit: (operation: string, metadata?: Record<string, unknown>) => audit(component, operation, metadata),
  };
}

/**
 * Security audit logging for sensitive operations.
 * Always logs at INFO level and includes an audit marker.
 */
export function audit(component: string, operation: string, metadata?: Record<string, unknown>): void {
  const auditMetadata = {
    ...metadata,
    audit: true,
    operation,
  };

  info(component, `Security audit: ${operation}`, auditMetadata);
}
