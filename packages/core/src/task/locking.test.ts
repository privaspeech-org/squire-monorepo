import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  acquireLock,
  isLocked,
  withLock,
  withLockSync,
  LockError,
} from './locking.js';

describe('Task Locking', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'squire-lock-test-'));
    testFile = join(tempDir, 'test.json');
    // Create a test file
    writeFileSync(testFile, JSON.stringify({ test: 'data' }));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('acquireLock', () => {
    it('should acquire and release a lock', async () => {
      const release = await acquireLock(testFile);
      assert.ok(typeof release === 'function', 'Should return a release function');

      // Verify the file is locked
      const locked = await isLocked(testFile);
      assert.ok(locked, 'File should be locked');

      // Release the lock
      await release();

      // Verify the file is unlocked
      const stillLocked = await isLocked(testFile);
      assert.ok(!stillLocked, 'File should be unlocked after release');
    });

    it('should prevent concurrent lock acquisition', async () => {
      const release1 = await acquireLock(testFile);

      // Try to acquire the same lock with a very short timeout
      let errorThrown = false;
      try {
        await acquireLock(testFile, {
          timeout: 100,
          retries: { retries: 1, minTimeout: 50, maxTimeout: 50 },
        });
      } catch (error) {
        errorThrown = true;
        assert.ok(error instanceof LockError, 'Should throw LockError');
        assert.ok(
          error.message.includes('Failed to acquire lock'),
          'Error message should indicate lock failure',
        );
      }

      assert.ok(errorThrown, 'Should throw error when lock is already held');

      // Release the first lock
      await release1();

      // Now should be able to acquire the lock
      const release2 = await acquireLock(testFile);
      await release2();
    });

    // Note: Stale lock handling is timing-dependent and tested manually.
    // The staleTimeout option is passed through to proper-lockfile which handles
    // stale lock detection automatically. Main functionality (preventing concurrent
    // access) is well-tested by other tests.
  });

  describe('isLocked', () => {
    it('should return false for unlocked file', async () => {
      const locked = await isLocked(testFile);
      assert.equal(locked, false, 'File should not be locked');
    });

    it('should return true for locked file', async () => {
      const release = await acquireLock(testFile);

      const locked = await isLocked(testFile);
      assert.equal(locked, true, 'File should be locked');

      await release();
    });
  });

  describe('withLock', () => {
    it('should execute function with lock held', async () => {
      let executed = false;

      const result = await withLock(testFile, async () => {
        executed = true;
        const locked = await isLocked(testFile);
        assert.ok(locked, 'File should be locked during execution');
        return 'test-result';
      });

      assert.equal(executed, true, 'Function should be executed');
      assert.equal(result, 'test-result', 'Should return function result');

      // Verify lock is released
      const locked = await isLocked(testFile);
      assert.ok(!locked, 'File should be unlocked after execution');
    });

    it('should release lock even if function throws', async () => {
      let errorCaught = false;

      try {
        await withLock(testFile, async () => {
          throw new Error('Test error');
        });
      } catch (error) {
        errorCaught = true;
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'Test error');
      }

      assert.ok(errorCaught, 'Error should be propagated');

      // Verify lock is released
      const locked = await isLocked(testFile);
      assert.ok(!locked, 'File should be unlocked even after error');
    });

    it('should prevent concurrent execution', async () => {
      const executions: number[] = [];

      // Start two concurrent withLock operations
      const promise1 = withLock(testFile, async () => {
        executions.push(1);
        await new Promise(resolve => setTimeout(resolve, 100));
        executions.push(1);
      });

      // Give first lock time to acquire
      await new Promise(resolve => setTimeout(resolve, 50));

      const promise2 = withLock(testFile, async () => {
        executions.push(2);
        await new Promise(resolve => setTimeout(resolve, 50));
        executions.push(2);
      });

      await Promise.all([promise1, promise2]);

      // Should execute sequentially, not interleaved
      assert.deepEqual(
        executions,
        [1, 1, 2, 2],
        'Executions should not be interleaved',
      );
    });
  });

  describe('withLockSync', () => {
    it('should execute synchronous function with lock held', async () => {
      let executed = false;

      const result = await withLockSync(testFile, () => {
        executed = true;
        return 'sync-result';
      });

      assert.equal(executed, true, 'Function should be executed');
      assert.equal(result, 'sync-result', 'Should return function result');

      // Verify lock is released
      const locked = await isLocked(testFile);
      assert.ok(!locked, 'File should be unlocked after execution');
    });

    it('should handle synchronous errors correctly', async () => {
      let errorCaught = false;

      try {
        await withLockSync(testFile, () => {
          throw new Error('Sync error');
        });
      } catch (error) {
        errorCaught = true;
        assert.ok(error instanceof Error);
        assert.equal(error.message, 'Sync error');
      }

      assert.ok(errorCaught, 'Error should be propagated');

      // Verify lock is released
      const locked = await isLocked(testFile);
      assert.ok(!locked, 'File should be unlocked even after error');
    });
  });

  describe('LockError', () => {
    it('should contain file path and cause', async () => {
      const release = await acquireLock(testFile);

      try {
        await acquireLock(testFile, {
          timeout: 100,
          retries: { retries: 1, minTimeout: 50, maxTimeout: 50 },
        });
        assert.fail('Should have thrown LockError');
      } catch (error) {
        assert.ok(error instanceof LockError);
        assert.equal(error.filePath, testFile);
        assert.ok(error.message.includes(testFile));
      } finally {
        await release();
      }
    });
  });
});
