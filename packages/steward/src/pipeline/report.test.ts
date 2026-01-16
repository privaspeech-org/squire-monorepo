import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { reportProgress } from './report.js';
import type { StewardConfig } from '../config.js';

describe('Report Progress', () => {
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    originalConsoleLog = console.log;
    console.log = mock.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  function createConfig(): StewardConfig {
    return {
      goals: [{ text: 'test goals' }],
      signals: {
        github: {
          repos: ['owner/repo'],
          watch: ['open_prs'],
        },
      },
      llm: {
        model: 'gpt-4',
      },
      execution: {
        backend: 'squire',
        squire: {
          default_repo: 'owner/repo',
          max_concurrent: 3,
          model: 'test-model',
        },
      },
      schedule: {
        interval: '5m',
        quiet_hours: '22:00-08:00',
        timezone: 'UTC',
      },
    };
  }

  describe('reportProgress', () => {
    it('should return early when no tasks', async () => {
      const config = createConfig();

      await reportProgress(config, []);

      const logCalls = console.log as any;
      assert.equal(logCalls.mock.calls.length, 0, 'Should not log when no tasks');
    });

    it('should report successful tasks', async () => {
      const config = createConfig();

      const tasks = [
        {
          prompt: 'Fix the bug in the API',
          priority: 'high' as const,
          depends_on: [],
          taskId: 'task-123',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
        {
          prompt: 'Add new feature for users',
          priority: 'medium' as const,
          depends_on: [],
          taskId: 'task-456',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
      ];

      await reportProgress(config, tasks);

      const logCalls = console.log as any;
      assert.ok(logCalls.mock.calls.length > 0, 'Should log report');

      const loggedText = logCalls.mock.calls.map((call: any) => call.arguments[0]).join('\n');
      assert.ok(loggedText.includes('Steward Report'), 'Should include report header');
      assert.ok(loggedText.includes('Dispatched: 2'), 'Should include dispatched count');
      assert.ok(loggedText.includes('task-123'), 'Should include task ID');
      assert.ok(loggedText.includes('Fix the bug'), 'Should include task prompt');
    });

    it('should report failed tasks', async () => {
      const config = createConfig();

      const tasks = [
        {
          prompt: 'Fix the bug',
          priority: 'high' as const,
          depends_on: [],
          taskId: 'task-123',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
        {
          prompt: 'Failed task',
          priority: 'medium' as const,
          depends_on: [],
          taskId: '',
          repo: 'owner/repo',
          status: 'failed' as const,
        },
      ];

      await reportProgress(config, tasks);

      const logCalls = console.log as any;
      const loggedText = logCalls.mock.calls.map((call: any) => call.arguments[0]).join('\n');

      assert.ok(loggedText.includes('Dispatched: 1'), 'Should include dispatched count');
      assert.ok(loggedText.includes('Failed: 1'), 'Should include failed count');
      assert.ok(loggedText.includes('Failed task'), 'Should include failed task prompt');
    });

    it('should handle all successful tasks', async () => {
      const config = createConfig();

      const tasks = [
        {
          prompt: 'Task 1',
          priority: 'high' as const,
          depends_on: [],
          taskId: 'task-1',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
        {
          prompt: 'Task 2',
          priority: 'medium' as const,
          depends_on: [],
          taskId: 'task-2',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
        {
          prompt: 'Task 3',
          priority: 'low' as const,
          depends_on: [],
          taskId: 'task-3',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
      ];

      await reportProgress(config, tasks);

      const logCalls = console.log as any;
      const loggedText = logCalls.mock.calls.map((call: any) => call.arguments[0]).join('\n');

      assert.ok(loggedText.includes('Dispatched: 3'), 'Should show all tasks dispatched');
      assert.ok(!loggedText.includes('Failed:'), 'Should not show failed section');
    });

    it('should handle all failed tasks', async () => {
      const config = createConfig();

      const tasks = [
        {
          prompt: 'Failed task 1',
          priority: 'high' as const,
          depends_on: [],
          taskId: '',
          repo: 'owner/repo',
          status: 'failed' as const,
        },
        {
          prompt: 'Failed task 2',
          priority: 'medium' as const,
          depends_on: [],
          taskId: '',
          repo: 'owner/repo',
          status: 'failed' as const,
        },
      ];

      await reportProgress(config, tasks);

      const logCalls = console.log as any;
      const loggedText = logCalls.mock.calls.map((call: any) => call.arguments[0]).join('\n');

      assert.ok(loggedText.includes('Dispatched: 0'), 'Should show no tasks dispatched');
      assert.ok(loggedText.includes('Failed: 2'), 'Should show two failed tasks');
      assert.ok(loggedText.includes('Failed task 1'), 'Should include first failed task');
      assert.ok(loggedText.includes('Failed task 2'), 'Should include second failed task');
    });

    it('should truncate long task prompts in report', async () => {
      const config = createConfig();

      const longPrompt = 'Fix the bug in the authentication system that occurs when users try to login with expired tokens and the server returns a 500 error instead of a proper error message';

      const tasks = [
        {
          prompt: longPrompt,
          priority: 'high' as const,
          depends_on: [],
          taskId: 'task-123',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
      ];

      await reportProgress(config, tasks);

      const logCalls = console.log as any;
      const loggedText = logCalls.mock.calls.map((call: any) => call.arguments[0]).join('\n');

      assert.ok(loggedText.length < longPrompt.length, 'Report should truncate long prompts');
      assert.ok(loggedText.includes('...'), 'Report should include truncation indicator');
    });

    it('should handle mixed statuses', async () => {
      const config = createConfig();

      const tasks = [
        {
          prompt: 'Success task',
          priority: 'high' as const,
          depends_on: [],
          taskId: 'task-1',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
        {
          prompt: 'Failed task',
          priority: 'medium' as const,
          depends_on: [],
          taskId: '',
          repo: 'owner/repo',
          status: 'failed' as const,
        },
        {
          prompt: 'Another success',
          priority: 'low' as const,
          depends_on: [],
          taskId: 'task-2',
          repo: 'owner/repo',
          status: 'dispatched' as const,
        },
      ];

      await reportProgress(config, tasks);

      const logCalls = console.log as any;
      const loggedText = logCalls.mock.calls.map((call: any) => call.arguments[0]).join('\n');

      assert.ok(loggedText.includes('Dispatched: 2'), 'Should show two dispatched');
      assert.ok(loggedText.includes('Failed: 1'), 'Should show one failed');
    });
  });
});
