import { lock, unlock, check, type LockOptions } from 'proper-lockfile';
import { debug, warn } from '../utils/logger.js';

/**
 * File-based locking for task operations to prevent race conditions.
 * Uses proper-lockfile for cross-process locking with timeout and stale lock handling.
 */

export interface LockConfig {
  /**
   * Maximum time to wait for lock acquisition (milliseconds)
   * @default 5000
   */
  timeout?: number;

  /**
   * How long a lock is considered stale (milliseconds)
   * After this time, the lock can be forcibly released
   * @default 30000
   */
  staleTimeout?: number;

  /**
   * Retry interval when waiting for lock (milliseconds)
   * @default 100
   */
  retries?: {
    retries?: number;
    minTimeout?: number;
    maxTimeout?: number;
  };
}

const DEFAULT_CONFIG: Required<LockConfig> = {
  timeout: 5000,
  staleTimeout: 30000,
  retries: {
    retries: 50,
    minTimeout: 100,
    maxTimeout: 200,
  },
};

/**
 * Error thrown when lock acquisition fails
 */
export class LockError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'LockError';
  }
}

/**
 * Acquire a lock on a file path
 *
 * @param filePath - The file to lock (typically a task JSON file)
 * @param config - Lock configuration options
 * @returns A release function to unlock the file
 * @throws {LockError} If lock cannot be acquired
 */
export async function acquireLock(
  filePath: string,
  config: LockConfig = {},
): Promise<() => Promise<void>> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const lockOptions: LockOptions = {
    stale: cfg.staleTimeout,
    retries: cfg.retries,
  };

  try {
    debug('task-locking', 'Attempting to acquire lock', {
      filePath,
      timeout: cfg.timeout,
      staleTimeout: cfg.staleTimeout,
    });

    // Attempt to acquire the lock
    const release = await lock(filePath, lockOptions);

    debug('task-locking', 'Lock acquired successfully', { filePath });

    // Return a wrapped release function with error handling
    return async () => {
      try {
        await release();
        debug('task-locking', 'Lock released successfully', { filePath });
      } catch (error) {
        warn('task-locking', 'Failed to release lock', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn('task-locking', 'Failed to acquire lock', {
      filePath,
      error: message,
    });

    throw new LockError(
      `Failed to acquire lock on ${filePath}: ${message}`,
      filePath,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Check if a file is currently locked
 *
 * @param filePath - The file to check
 * @returns True if the file is locked
 */
export async function isLocked(filePath: string): Promise<boolean> {
  try {
    return await check(filePath);
  } catch (error) {
    // If check fails, assume not locked
    debug('task-locking', 'Lock check failed, assuming not locked', {
      filePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Execute a function with a lock held on a file
 * Automatically releases the lock when done, even if an error occurs
 *
 * @param filePath - The file to lock
 * @param fn - The function to execute while holding the lock
 * @param config - Lock configuration options
 * @returns The result of the function
 * @throws {LockError} If lock cannot be acquired
 */
export async function withLock<T>(
  filePath: string,
  fn: () => T | Promise<T>,
  config: LockConfig = {},
): Promise<T> {
  const release = await acquireLock(filePath, config);

  try {
    return await fn();
  } finally {
    await release();
  }
}

/**
 * Execute a synchronous function with a lock held on a file
 * This is a convenience wrapper for synchronous operations
 *
 * @param filePath - The file to lock
 * @param fn - The synchronous function to execute
 * @param config - Lock configuration options
 * @returns The result of the function
 */
export async function withLockSync<T>(
  filePath: string,
  fn: () => T,
  config: LockConfig = {},
): Promise<T> {
  return withLock(filePath, () => Promise.resolve(fn()), config);
}
