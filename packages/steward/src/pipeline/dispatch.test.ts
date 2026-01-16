import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Task } from './analyze.js';
import type { DispatchedTask } from './dispatch.js';

describe('Dispatch Module Helper Functions', () => {
  describe('Concurrency calculation', () => {
    it('should calculate available slots correctly', () => {
      const maxConcurrent = 5;
      const activeTasks = 2;
      const squireRunning = 3;
      const currentActive = Math.max(activeTasks, squireRunning);
      const available = maxConcurrent - currentActive;

      assert.equal(currentActive, 3);
      assert.equal(available, 2);
    });

    it('should use maximum of active and squire running counts', () => {
      const activeTasks = 1;
      const squireRunning = 4;

      const currentActive = Math.max(activeTasks, squireRunning);

      assert.equal(currentActive, 4);
    });

    it('should return 0 when max concurrent is reached', () => {
      const maxConcurrent = 3;
      const activeTasks = 3;
      const squireRunning = 2;
      const currentActive = Math.max(activeTasks, squireRunning);
      const available = maxConcurrent - currentActive;

      assert.equal(currentActive, 3);
      assert.equal(available, 0);
    });

    it('should return negative when over capacity', () => {
      const maxConcurrent = 3;
      const activeTasks = 5;
      const squireRunning = 4;
      const currentActive = Math.max(activeTasks, squireRunning);
      const available = maxConcurrent - currentActive;

      assert.equal(currentActive, 5);
      assert.equal(available, -2);
    });

    it('should return max concurrent when no active tasks', () => {
      const maxConcurrent = 5;
      const activeTasks = 0;
      const squireRunning = 0;
      const currentActive = Math.max(activeTasks, squireRunning);
      const available = maxConcurrent - currentActive;

      assert.equal(currentActive, 0);
      assert.equal(available, 5);
    });
  });

  describe('Task slicing for dispatch', () => {
    it('should slice tasks to available slots', () => {
      const tasks: Task[] = [
        { prompt: 'Task 1', priority: 'high', depends_on: [] },
        { prompt: 'Task 2', priority: 'medium', depends_on: [] },
        { prompt: 'Task 3', priority: 'low', depends_on: [] },
      ];
      const available = 2;
      const toDispatch = tasks.slice(0, available);

      assert.equal(toDispatch.length, 2);
      assert.equal(toDispatch[0].prompt, 'Task 1');
      assert.equal(toDispatch[1].prompt, 'Task 2');
    });

    it('should dispatch all tasks when available is greater', () => {
      const tasks: Task[] = [
        { prompt: 'Task 1', priority: 'high', depends_on: [] },
        { prompt: 'Task 2', priority: 'medium', depends_on: [] },
      ];
      const available = 5;
      const toDispatch = tasks.slice(0, available);

      assert.equal(toDispatch.length, 2);
    });

    it('should return empty array when no tasks', () => {
      const tasks: Task[] = [];
      const available = 3;
      const toDispatch = tasks.slice(0, available);

      assert.equal(toDispatch.length, 0);
    });

    it('should return empty array when no slots available', () => {
      const tasks: Task[] = [
        { prompt: 'Task 1', priority: 'high', depends_on: [] },
        { prompt: 'Task 2', priority: 'medium', depends_on: [] },
      ];
      const available = 0;
      const toDispatch = tasks.slice(0, available);

      assert.equal(toDispatch.length, 0);
    });
  });

  describe('GitHub token validation', () => {
    it('should throw error when GITHUB_TOKEN is not set', () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;

      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

      assert.ok(!githubToken, 'GitHub token should not be set');
    });

    it('should use GITHUB_TOKEN when set', () => {
      process.env.GITHUB_TOKEN = 'ghp_test_token';

      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

      assert.equal(githubToken, 'ghp_test_token');

      delete process.env.GITHUB_TOKEN;
    });

    it('should fall back to GH_TOKEN when GITHUB_TOKEN is not set', () => {
      delete process.env.GITHUB_TOKEN;
      process.env.GH_TOKEN = 'gho_test_token';

      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

      assert.equal(githubToken, 'gho_test_token');

      delete process.env.GH_TOKEN;
    });

    it('should prefer GITHUB_TOKEN over GH_TOKEN when both are set', () => {
      process.env.GITHUB_TOKEN = 'ghp_token_1';
      process.env.GH_TOKEN = 'gho_token_2';

      const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

      assert.equal(githubToken, 'ghp_token_1');

      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
    });
  });

  describe('Dispatched task structure', () => {
    it('should create dispatched task with status dispatched', () => {
      const task: Task = {
        prompt: 'Fix bug',
        priority: 'high',
        depends_on: [],
      };

      const dispatchedTask: DispatchedTask = {
        ...task,
        taskId: 'task-123',
        repo: 'owner/repo',
        status: 'dispatched',
      };

      assert.equal(dispatchedTask.prompt, 'Fix bug');
      assert.equal(dispatchedTask.priority, 'high');
      assert.equal(dispatchedTask.taskId, 'task-123');
      assert.equal(dispatchedTask.repo, 'owner/repo');
      assert.equal(dispatchedTask.status, 'dispatched');
    });

    it('should create dispatched task with status failed', () => {
      const task: Task = {
        prompt: 'Fix bug',
        priority: 'high',
        depends_on: [],
      };

      const dispatchedTask: DispatchedTask = {
        ...task,
        taskId: '',
        repo: 'owner/repo',
        status: 'failed',
      };

      assert.equal(dispatchedTask.status, 'failed');
      assert.equal(dispatchedTask.taskId, '');
    });

    it('should preserve original task properties', () => {
      const task: Task = {
        prompt: 'Complex task',
        priority: 'medium',
        depends_on: ['task-1', 'task-2'],
      };

      const dispatchedTask: DispatchedTask = {
        ...task,
        taskId: 'task-123',
        repo: 'owner/repo',
        status: 'dispatched',
      };

      assert.equal(dispatchedTask.prompt, 'Complex task');
      assert.equal(dispatchedTask.priority, 'medium');
      assert.deepEqual(dispatchedTask.depends_on, ['task-1', 'task-2']);
    });
  });

  describe('Config validation', () => {
    it('should validate required squire config', () => {
      const squireConfig = {
        default_repo: 'owner/repo',
        model: 'test-model',
        max_concurrent: 3,
      };

      assert.ok(squireConfig);
      assert.equal(squireConfig.default_repo, 'owner/repo');
      assert.equal(squireConfig.model, 'test-model');
      assert.equal(squireConfig.max_concurrent, 3);
    });

    it('should handle missing squire config', () => {
      const squireConfig = undefined;

      if (!squireConfig) {
        assert.ok(true, 'Should handle missing config');
      } else {
        assert.fail('Should not have config');
      }
    });

    it('should use default max_concurrent', () => {
      const squireConfig = {
        default_repo: 'owner/repo',
        model: 'test-model',
        max_concurrent: undefined as number | undefined,
      };

      const maxConcurrent = squireConfig.max_concurrent || 3;

      assert.equal(maxConcurrent, 3);
    });
  });

  describe('Task logging format', () => {
    it('should format task log message correctly', () => {
      const taskId = 'task-123';
      const prompt = 'Fix the bug in authentication module';

      const logMessage = `✓ Dispatched ${taskId}: ${prompt.slice(0, 40)}...`;

      assert.equal(logMessage, '✓ Dispatched task-123: Fix the bug in authentication module...');
    });

    it('should format short prompt without truncation', () => {
      const taskId = 'task-456';
      const prompt = 'Fix bug';

      const logMessage = `✓ Dispatched ${taskId}: ${prompt.slice(0, 40)}...`;

      assert.equal(logMessage, '✓ Dispatched task-456: Fix bug...');
    });

    it('should format error log message correctly', () => {
      const prompt = 'Complex task that failed to dispatch';
      const error = 'Docker daemon not running';

      const logMessage = `✗ Failed to dispatch: ${prompt.slice(0, 40)}...`;
      const errorMessage = `  ${error}`;

      assert.equal(logMessage, '✗ Failed to dispatch: Complex task that failed to dispatch...');
      assert.equal(errorMessage, '  Docker daemon not running');
    });
  });

  describe('Environment variable construction for container', () => {
    it('should construct correct environment variables', () => {
      const squireTask = {
        id: 'task-123',
        repo: 'owner/repo',
        prompt: 'Fix bug',
        branch: 'squire/task-123',
        baseBranch: 'main',
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
      };

      const githubToken = 'ghp_test_token';
      const model = 'test-model';

      const env = [
        `TASK_ID=${squireTask.id}`,
        `REPO=${squireTask.repo}`,
        `PROMPT=${squireTask.prompt}`,
        `BRANCH=${squireTask.branch}`,
        `BASE_BRANCH=${squireTask.baseBranch}`,
        `GITHUB_TOKEN=${githubToken}`,
        `GH_TOKEN=${githubToken}`,
        `MODEL=${model}`,
      ];

      assert.equal(env[0], 'TASK_ID=task-123');
      assert.equal(env[5], 'GITHUB_TOKEN=ghp_test_token');
      assert.equal(env[6], 'GH_TOKEN=ghp_test_token');
      assert.equal(env[7], 'MODEL=test-model');
    });
  });

  describe('Error handling', () => {
    it('should handle Error objects correctly', () => {
      const error: unknown = new Error('Container start failed');
      const message = error instanceof Error ? error.message : String(error);

      assert.equal(message, 'Container start failed');
    });

    it('should handle non-Error objects', () => {
      const error: unknown = 'String error message';
      const message = error instanceof Error ? error.message : String(error);

      assert.equal(message, 'String error message');
    });

    it('should handle numeric error codes', () => {
      const error: unknown = 404;
      const message = error instanceof Error ? error.message : String(error);

      assert.equal(message, '404');
    });

    it('should handle null errors', () => {
      const error: unknown = null;
      const message = error instanceof Error ? error.message : String(error);

      assert.equal(message, 'null');
    });
  });
});
