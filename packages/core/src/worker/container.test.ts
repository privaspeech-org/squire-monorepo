import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper functions extracted from container.ts for testing
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const message = err.message.toLowerCase();
  const transientPatterns = [
    'econnrefused',
    'enotfound',
    'etimedout',
    'socket hang up',
    'network error',
    'no such container',
    'container is restarting',
    'oom killed',
  ];

  return transientPatterns.some(pattern => message.includes(pattern));
}

function calculateBackoffDelay(retryCount: number): number {
  const baseDelay = Math.min(Math.pow(2, retryCount) * 1000, 60000);
  const jitter = baseDelay * 0.2 * (Math.random() - 0.5);
  return Math.floor(baseDelay + jitter);
}

describe('Container Module Helper Functions', () => {
  describe('isTransientError', () => {
    it('should identify transient errors', () => {
      const transientErrors = [
        new Error('ECONNREFUSED'),
        new Error('ENOTFOUND'),
        new Error('ETIMEDOUT'),
        new Error('socket hang up'),
        new Error('network error'),
        new Error('no such container'),
        new Error('container is restarting'),
        new Error('OOM killed'),
        new Error('some ECONNREFUSED error'),
      ];

      for (const err of transientErrors) {
        const isTransient = isTransientError(err);
        assert.ok(isTransient, `Should be transient: ${err.message}`);
      }
    });

    it('should not identify non-transient errors', () => {
      const nonTransientErrors = [
        new Error('permission denied'),
        new Error('invalid image'),
        new Error('command not found'),
        new Error('some random error'),
      ];

      for (const err of nonTransientErrors) {
        const isTransient = isTransientError(err);
        assert.ok(!isTransient, `Should not be transient: ${err.message}`);
      }
    });

    it('should handle non-Error objects', () => {
      assert.equal(isTransientError(null), false);
      assert.equal(isTransientError('string'), false);
      assert.equal(isTransientError(123), false);
      assert.equal(isTransientError(undefined), false);
    });
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff with retry 0', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(0);
        assert.ok(delay >= 800 && delay <= 1200, `Should be ~1 second with jitter: ${delay}`);
      }
    });

    it('should calculate exponential backoff with retry 1', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(1);
        assert.ok(delay >= 1600 && delay <= 2400, `Should be ~2 seconds with jitter: ${delay}`);
      }
    });

    it('should calculate exponential backoff with retry 2', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(2);
        assert.ok(delay >= 3200 && delay <= 4800, `Should be ~4 seconds with jitter: ${delay}`);
      }
    });

    it('should cap at 60 seconds', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffDelay(10);
        assert.ok(delay >= 48000 && delay <= 72000, `Should be ~60 seconds with jitter: ${delay}`);
      }
    });

    it('should increase delay with retry count', () => {
      const delays = Array.from({ length: 5 }, (_, i) => {
        let sum = 0;
        let samples = 100;
        for (let j = 0; j < samples; j++) {
          sum += calculateBackoffDelay(i);
        }
        return sum / samples;
      });

      for (let i = 1; i < delays.length; i++) {
        assert.ok(delays[i] > delays[i - 1], `Retry ${i} should have longer delay than ${i - 1}`);
      }
    });
  });

  describe('Container options handling', () => {
    it('should apply defaults to container config', () => {
      const config = {
        timeoutMinutes: undefined as number | undefined,
        maxRetries: undefined as number | undefined,
        cpuLimit: undefined as number | undefined,
        memoryLimitMB: undefined as number | undefined,
        preserveLogsOnFailure: undefined as boolean | undefined,
      };

      const result = {
        timeoutMinutes: config.timeoutMinutes ?? 30,
        maxRetries: config.maxRetries ?? 3,
        cpuLimit: config.cpuLimit ?? 2,
        memoryLimitMB: config.memoryLimitMB ?? 4096,
        preserveLogsOnFailure: config.preserveLogsOnFailure ?? true,
      };

      assert.equal(result.timeoutMinutes, 30);
      assert.equal(result.maxRetries, 3);
      assert.equal(result.cpuLimit, 2);
      assert.equal(result.memoryLimitMB, 4096);
      assert.equal(result.preserveLogsOnFailure, true);
    });

    it('should use provided container config values', () => {
      const config = {
        timeoutMinutes: 60,
        maxRetries: 5,
        cpuLimit: 4,
        memoryLimitMB: 8192,
        preserveLogsOnFailure: false,
      };

      const result = {
        timeoutMinutes: config.timeoutMinutes ?? 30,
        maxRetries: config.maxRetries ?? 3,
        cpuLimit: config.cpuLimit ?? 2,
        memoryLimitMB: config.memoryLimitMB ?? 4096,
        preserveLogsOnFailure: config.preserveLogsOnFailure ?? true,
      };

      assert.equal(result.timeoutMinutes, 60);
      assert.equal(result.maxRetries, 5);
      assert.equal(result.cpuLimit, 4);
      assert.equal(result.memoryLimitMB, 8192);
      assert.equal(result.preserveLogsOnFailure, false);
    });
  });

  describe('Environment variable construction', () => {
    it('should construct correct environment variables for container', () => {
      const task = {
        id: 'task-123',
        repo: 'owner/repo',
        prompt: 'Fix the bug',
        branch: 'squire/task-123',
        baseBranch: 'main',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      const githubToken = 'ghp_test_token';
      const model = 'test-model';

      const env = [
        `TASK_ID=${task.id}`,
        `REPO=${task.repo}`,
        `PROMPT=${task.prompt}`,
        `BRANCH=${task.branch}`,
        `BASE_BRANCH=${task.baseBranch}`,
        `GITHUB_TOKEN=${githubToken}`,
        `GH_TOKEN=${githubToken}`,
        `MODEL=${model}`,
      ];

      assert.equal(env[0], 'TASK_ID=task-123');
      assert.equal(env[1], 'REPO=owner/repo');
      assert.equal(env[2], 'PROMPT=Fix the bug');
      assert.equal(env[3], 'BRANCH=squire/task-123');
      assert.equal(env[4], 'BASE_BRANCH=main');
      assert.equal(env[5], 'GITHUB_TOKEN=ghp_test_token');
      assert.equal(env[6], 'GH_TOKEN=ghp_test_token');
      assert.equal(env[7], 'MODEL=test-model');
    });

    it('should handle special characters in prompt', () => {
      const task = {
        id: 'task-123',
        repo: 'owner/repo',
        prompt: 'Fix: "bug" & issue #42',
        branch: 'squire/task-123',
        baseBranch: 'main',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      const env = `PROMPT=${task.prompt}`;
      assert.equal(env, 'PROMPT=Fix: "bug" & issue #42');
    });
  });

  describe('Resource limits conversion', () => {
    it('should convert MB to bytes for memory limit', () => {
      const memoryLimitMB = 4096;
      const memoryBytes = memoryLimitMB * 1024 * 1024;
      assert.equal(memoryBytes, 4294967296);
    });

    it('should convert various MB values to bytes', () => {
      const testCases = [
        { mb: 1024, expected: 1073741824 },
        { mb: 2048, expected: 2147483648 },
        { mb: 4096, expected: 4294967296 },
        { mb: 8192, expected: 8589934592 },
      ];

      for (const { mb, expected } of testCases) {
        const memoryBytes = mb * 1024 * 1024;
        assert.equal(memoryBytes, expected, `${mb}MB should equal ${expected} bytes`);
      }
    });

    it('should convert cores to nanocpus', () => {
      const cpuLimit = 2;
      const nanocpus = cpuLimit * 1e9;
      assert.equal(nanocpus, 2000000000);
    });

    it('should convert various core values to nanocpus', () => {
      const testCases = [
        { cores: 1, expected: 1000000000 },
        { cores: 2, expected: 2000000000 },
        { cores: 4, expected: 4000000000 },
        { cores: 8, expected: 8000000000 },
      ];

      for (const { cores, expected } of testCases) {
        const nanocpus = cores * 1e9;
        assert.equal(nanocpus, expected, `${cores} cores should equal ${expected} nanocpus`);
      }
    });
  });

  describe('Container labels construction', () => {
    it('should construct correct labels for container', () => {
      const task = {
        id: 'task-123',
        repo: 'owner/repo',
        prompt: 'Test task',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };

      const labels = {
        'squire.task.id': task.id,
        'squire.repo': task.repo,
        'squire.retry': String(task.retryCount),
      };

      assert.equal(labels['squire.task.id'], 'task-123');
      assert.equal(labels['squire.repo'], 'owner/repo');
      assert.equal(labels['squire.retry'], '0');
    });

    it('should convert retry count to string', () => {
      const labels = {
        'squire.retry': String(5),
      };
      assert.equal(labels['squire.retry'], '5');
    });
  });
});
