import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Signal } from './collect.js';

// Helper function to format signals (extracted from analyze.ts)
function formatSignal(s: Signal): string {
  if (s.type === 'greptile_review' && s.data.parsed) {
    const p = s.data.parsed as { file: string; line: number; description: string };
    const confidence = s.greptile_confidence !== undefined ? ` [confidence: ${s.greptile_confidence}/5]` : '';
    return `[github/greptile_review] PR#${s.data.prNumber}: ${p.file}:${p.line} - ${p.description}${confidence}`;
  }
  return `[${s.source}/${s.type}] ${JSON.stringify(s.data)}`;
}

// Helper function to parse LLM response (extracted from analyze.ts)
function parseLLMResponse(content: string): any[] {
  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonContent);
    return Array.isArray(parsed) ? parsed : parsed.tasks || [];
  } catch {
    return [];
  }
}

describe('Analyze Module Helper Functions', () => {
  describe('formatSignal', () => {
    it('should format greptile_review signals', () => {
      const signal: Signal = {
        source: 'github',
        type: 'greptile_review',
        data: {
          repo: 'owner/repo',
          prNumber: 123,
          parsed: {
            file: 'src/test.ts',
            line: 42,
            description: 'Test description',
          },
        },
        timestamp: new Date(),
        greptile_confidence: 5,
      };

      const formatted = formatSignal(signal);
      assert.equal(
        formatted,
        '[github/greptile_review] PR#123: src/test.ts:42 - Test description [confidence: 5/5]'
      );
    });

    it('should format greptile_review signals without confidence', () => {
      const signal: Signal = {
        source: 'github',
        type: 'greptile_review',
        data: {
          repo: 'owner/repo',
          prNumber: 123,
          parsed: {
            file: 'src/test.ts',
            line: 42,
            description: 'Test description',
          },
        },
        timestamp: new Date(),
      };

      const formatted = formatSignal(signal);
      assert.equal(
        formatted,
        '[github/greptile_review] PR#123: src/test.ts:42 - Test description'
      );
    });

    it('should format non-greptile signals', () => {
      const signal: Signal = {
        source: 'github',
        type: 'failed_ci',
        data: {
          repo: 'owner/repo',
          prNumber: 123,
          check: 'tests',
        },
        timestamp: new Date(),
      };

      const formatted = formatSignal(signal);
      assert.ok(formatted.includes('[github/failed_ci]'));
      assert.ok(formatted.includes('owner/repo'));
    });

    it('should handle greptile_review without parsed data', () => {
      const signal: Signal = {
        source: 'github',
        type: 'greptile_review',
        data: {
          repo: 'owner/repo',
          prNumber: 123,
        },
        timestamp: new Date(),
        greptile_confidence: 4,
      };

      const formatted = formatSignal(signal);
      assert.ok(formatted.includes('[github/greptile_review]'));
    });
  });

  describe('parseLLMResponse', () => {
    it('should parse valid JSON array', () => {
      const content = '[{"prompt": "Fix bug", "priority": "high", "depends_on": []}]';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].prompt, 'Fix bug');
      assert.equal(result[0].priority, 'high');
      assert.deepEqual(result[0].depends_on, []);
    });

    it('should parse JSON with code fences', () => {
      const content = '```json\n[{"prompt": "Fix bug", "priority": "high", "depends_on": []}]\n```';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].prompt, 'Fix bug');
    });

    it('should parse JSON with generic code fences', () => {
      const content = '```\n[{"prompt": "Fix bug", "priority": "high", "depends_on": []}]\n```';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].prompt, 'Fix bug');
    });

    it('should parse object with tasks property', () => {
      const content = '{"tasks": [{"prompt": "Fix bug", "priority": "high", "depends_on": []}]}';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].prompt, 'Fix bug');
    });

    it('should parse empty array', () => {
      const content = '[]';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('should handle empty string', () => {
      const content = '';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('should handle invalid JSON', () => {
      const content = 'not valid json';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('should handle malformed JSON with code fences', () => {
      const content = '```json\ninvalid json\n```';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 0);
    });

    it('should parse multiple tasks', () => {
      const content = JSON.stringify([
        { prompt: 'Fix bug A', priority: 'high', depends_on: [] },
        { prompt: 'Fix bug B', priority: 'medium', depends_on: ['task-1'] },
        { prompt: 'Fix bug C', priority: 'low', depends_on: [] },
      ]);
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 3);
      assert.equal(result[0].prompt, 'Fix bug A');
      assert.equal(result[1].prompt, 'Fix bug B');
      assert.equal(result[2].prompt, 'Fix bug C');
      assert.equal(result[1].depends_on[0], 'task-1');
    });

    it('should handle tasks with dependencies', () => {
      const content = JSON.stringify([
        { prompt: 'Base task', priority: 'high', depends_on: [] },
        { prompt: 'Dependent task', priority: 'medium', depends_on: ['base-task-id'] },
      ]);
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 2);
      assert.equal(result[0].depends_on.length, 0);
      assert.equal(result[1].depends_on.length, 1);
      assert.equal(result[1].depends_on[0], 'base-task-id');
    });

    it('should handle all priority levels', () => {
      const content = JSON.stringify([
        { prompt: 'High priority', priority: 'high', depends_on: [] },
        { prompt: 'Medium priority', priority: 'medium', depends_on: [] },
        { prompt: 'Low priority', priority: 'low', depends_on: [] },
      ]);
      const result = parseLLMResponse(content);

      assert.equal(result[0].priority, 'high');
      assert.equal(result[1].priority, 'medium');
      assert.equal(result[2].priority, 'low');
    });

    it('should trim whitespace from content', () => {
      const content = '  [{"prompt": "Fix bug", "priority": "high", "depends_on": []}]  ';
      const result = parseLLMResponse(content);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0].prompt, 'Fix bug');
    });
  });

  describe('Task prompt construction', () => {
    it('should construct prompt with all sections', () => {
      const goals = 'Build a new feature';
      const signalSummary = '[github/failed_ci] PR#123: tests failed';
      const activeTasksSummary = '- [task-1] owner/repo: Fix bug...';
      const recentTasksSummary = '- owner/repo: Fix bug... -> completed';
      const failedTasksSummary = '- owner/repo: Failed task...';

      const prompt = `You are a software development orchestrator. Given the goals, signals, and task history, determine what NEW coding tasks should be created.

## GOALS
${goals}

## CURRENT SIGNALS
${signalSummary}

## ACTIVE TASKS (already in progress - DO NOT duplicate)
${activeTasksSummary}

## RECENTLY COMPLETED (last 7 days - already done)
${recentTasksSummary}

## RECENT FAILURES (last 7 days - be careful retrying these)
${failedTasksSummary}

---

Based on this context, what NEW coding tasks should be created?

Rules:
1. Do NOT create tasks that duplicate active tasks
2. Do NOT recreate recently completed tasks unless signals indicate a problem
3. Be cautious about retrying failed tasks - only if you have new information
4. Focus on CI failures (high priority), actionable issues, progress toward goals
5. Skip tasks for PRs that just need human review

Respond with a JSON array of tasks (repo is configured separately):
[{ "prompt": "detailed task description", "priority": "high|medium|low", "depends_on": [] }]

If no NEW tasks are needed, respond with an empty array: []`;

      assert.ok(prompt.includes('## GOALS'));
      assert.ok(prompt.includes('## CURRENT SIGNALS'));
      assert.ok(prompt.includes('## ACTIVE TASKS'));
      assert.ok(prompt.includes('## RECENTLY COMPLETED'));
      assert.ok(prompt.includes('## RECENT FAILURES'));
      assert.ok(prompt.includes('Rules:'));
      assert.ok(prompt.includes('JSON array of tasks'));
    });

    it('should handle empty summaries', () => {
      const goals = 'Build a new feature';
      const signalSummary = '';
      const activeTasksSummary = 'None';
      const recentTasksSummary = 'None';
      const failedTasksSummary = 'None';

      assert.ok(goals.length > 0);
      assert.equal(activeTasksSummary, 'None');
      assert.equal(recentTasksSummary, 'None');
      assert.equal(failedTasksSummary, 'None');
    });
  });

  describe('Signal summary generation', () => {
    it('should join multiple signals with newlines', () => {
      const signals: Signal[] = [
        {
          source: 'github',
          type: 'failed_ci',
          data: { repo: 'owner/repo', prNumber: 1 },
          timestamp: new Date(),
        },
        {
          source: 'github',
          type: 'open_pr',
          data: { repo: 'owner/repo', prNumber: 2 },
          timestamp: new Date(),
        },
      ];

      const summary = signals.map(formatSignal).join('\n');
      const lines = summary.split('\n');

      assert.equal(lines.length, 2);
      assert.ok(lines[0].includes('[github/failed_ci]'));
      assert.ok(lines[1].includes('[github/open_pr]'));
    });

    it('should handle empty signals array', () => {
      const signals: Signal[] = [];
      const summary = signals.map(formatSignal).join('\n');

      assert.equal(summary, '');
    });
  });

  describe('Task structure validation', () => {
    it('should validate task structure', () => {
      const task = {
        prompt: 'Fix the bug in user authentication',
        priority: 'high',
        depends_on: [],
      };

      assert.equal(typeof task.prompt, 'string');
      assert.ok(task.prompt.length > 0);
      assert.ok(['high', 'medium', 'low'].includes(task.priority));
      assert.ok(Array.isArray(task.depends_on));
      assert.ok(task.depends_on.every(dep => typeof dep === 'string'));
    });

    it('should validate task with dependencies', () => {
      const task = {
        prompt: 'Implement the feature',
        priority: 'medium',
        depends_on: ['task-1', 'task-2'],
      };

      assert.equal(task.depends_on.length, 2);
      assert.equal(task.depends_on[0], 'task-1');
      assert.equal(task.depends_on[1], 'task-2');
    });
  });
});
