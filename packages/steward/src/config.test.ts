import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadGoals, loadConfig, resolveConfigPath, type StewardConfig } from './config.js';

describe('loadGoals', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'steward-config-test-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true });
  });

  function createConfig(goals: Array<{ path?: string; text?: string }>): StewardConfig {
    return {
      goals,
      signals: { github: { repos: [], watch: [] } },
      execution: { backend: 'squire' },
      llm: { model: 'test-model' },
      schedule: { interval: '1h', quiet_hours: '22:00-08:00', timezone: 'UTC' },
    } as StewardConfig;
  }

  it('should load goals from text', () => {
    const config = createConfig([
      { text: 'Goal 1: Build great software' },
      { text: 'Goal 2: Ship fast' },
    ]);

    const goals = loadGoals(config);

    assert.ok(goals.includes('Goal 1: Build great software'));
    assert.ok(goals.includes('Goal 2: Ship fast'));
  });

  it('should load goals from file path', () => {
    const goalFile = join(tempDir, 'goals.md');
    writeFileSync(goalFile, '# Project Goals\n\nBuild the best product');

    const config = createConfig([{ path: goalFile }]);

    const goals = loadGoals(config);

    assert.ok(goals.includes('# Project Goals'));
    assert.ok(goals.includes('Build the best product'));
  });

  it('should combine file and text goals', () => {
    const goalFile = join(tempDir, 'goals.md');
    writeFileSync(goalFile, 'File-based goal');

    const config = createConfig([
      { path: goalFile },
      { text: 'Text-based goal' },
    ]);

    const goals = loadGoals(config);

    assert.ok(goals.includes('File-based goal'));
    assert.ok(goals.includes('Text-based goal'));
  });

  it('should skip non-existent file paths', () => {
    const config = createConfig([
      { path: '/non/existent/file.md' },
      { text: 'Fallback goal' },
    ]);

    const goals = loadGoals(config);

    assert.ok(goals.includes('Fallback goal'));
    assert.ok(!goals.includes('non/existent'));
  });

  it('should return empty string for empty goals', () => {
    const config = createConfig([]);

    const goals = loadGoals(config);

    assert.equal(goals, '');
  });
});

describe('StewardConfig interface', () => {
  it('should support all configuration fields', () => {
    // Type-level test - verifies the interface shape
    const config: StewardConfig = {
      goals: [{ text: 'test' }],
      signals: {
        github: {
          repos: ['owner/repo'],
          watch: ['open_prs', 'failed_ci', 'issues', 'greptile_reviews'],
        },
        posthog: {
          project: 'test-project',
          events: ['user_signup'],
        },
        files: ['./tasks.md'],
      },
      execution: {
        backend: 'squire',
        squire: {
          default_repo: 'owner/repo',
          model: 'gpt-4',
          max_concurrent: 3,
        },
      },
      auto_merge: {
        enabled: true,
        min_confidence: 5,
      },
      notify: {
        telegram: { chat_id: '123' },
        slack: { webhook: 'https://hooks.slack.com/...' },
      },
      llm: {
        model: 'anthropic:claude-3-opus-20240229',
      },
      schedule: {
        interval: '30m',
        quiet_hours: '22:00-08:00',
        timezone: 'America/New_York',
      },
    };

    assert.ok(config.goals.length > 0);
    assert.equal(config.execution.backend, 'squire');
    assert.equal(config.auto_merge?.enabled, true);
  });
});

describe('resolveConfigPath', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'steward-config-path-test-'));
    originalCwd = process.cwd();
    originalEnv = process.env.STEWARD_CONFIG_PATH;
    delete process.env.STEWARD_CONFIG_PATH;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalEnv !== undefined) {
      process.env.STEWARD_CONFIG_PATH = originalEnv;
    } else {
      delete process.env.STEWARD_CONFIG_PATH;
    }
    rmSync(tempDir, { recursive: true });
  });

  it('should use STEWARD_CONFIG_PATH env var when set', () => {
    const configPath = join(tempDir, 'custom-steward.yaml');
    writeFileSync(configPath, 'goals: []');
    process.env.STEWARD_CONFIG_PATH = configPath;

    const resolved = resolveConfigPath();

    assert.equal(resolved, configPath);
  });

  it('should fall back to ./steward.yaml in local dev', () => {
    process.chdir(tempDir);
    const configPath = join(tempDir, 'steward.yaml');
    writeFileSync(configPath, 'goals: []');

    const resolved = resolveConfigPath();

    assert.equal(resolved, './steward.yaml');
  });

  it('should throw error with searched paths when config not found', () => {
    process.chdir(tempDir);

    assert.throws(
      () => resolveConfigPath(),
      (err: Error) => {
        assert.ok(err.message.includes('steward.yaml not found'));
        assert.ok(err.message.includes('/config/steward.yaml'));
        assert.ok(err.message.includes('./steward.yaml'));
        assert.ok(err.message.includes('STEWARD_CONFIG_PATH'));
        return true;
      }
    );
  });

  it('should prefer STEWARD_CONFIG_PATH over other paths', () => {
    process.chdir(tempDir);
    // Create both files
    writeFileSync(join(tempDir, 'steward.yaml'), 'goals: [text: local]');
    const customPath = join(tempDir, 'custom.yaml');
    writeFileSync(customPath, 'goals: [text: custom]');
    process.env.STEWARD_CONFIG_PATH = customPath;

    const resolved = resolveConfigPath();

    assert.equal(resolved, customPath);
  });
});

describe('loadConfig', () => {
  let tempDir: string;
  let originalCwd: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'steward-loadconfig-test-'));
    originalCwd = process.cwd();
    originalEnv = process.env.STEWARD_CONFIG_PATH;
    delete process.env.STEWARD_CONFIG_PATH;
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalEnv !== undefined) {
      process.env.STEWARD_CONFIG_PATH = originalEnv;
    } else {
      delete process.env.STEWARD_CONFIG_PATH;
    }
    rmSync(tempDir, { recursive: true });
  });

  it('should load and parse config from resolved path', async () => {
    const configContent = `
goals:
  - text: "Build great software"
signals:
  github:
    repos: ["owner/repo"]
    watch: ["open_prs"]
execution:
  backend: squire
  squire:
    default_repo: "owner/repo"
    model: "gpt-4"
    max_concurrent: 3
llm:
  model: "anthropic:claude-3-opus-20240229"
schedule:
  interval: "1h"
  quiet_hours: "22:00-08:00"
  timezone: "UTC"
`;
    writeFileSync(join(tempDir, 'steward.yaml'), configContent);

    const config = await loadConfig();

    assert.equal(config.goals[0].text, 'Build great software');
    assert.equal(config.execution.backend, 'squire');
    assert.equal(config.execution.squire?.default_repo, 'owner/repo');
  });

  it('should load config from STEWARD_CONFIG_PATH', async () => {
    const customPath = join(tempDir, 'custom-config.yaml');
    const configContent = `
goals:
  - text: "Custom goal"
signals:
  github:
    repos: []
    watch: []
execution:
  backend: squire
llm:
  model: "test-model"
schedule:
  interval: "1h"
  quiet_hours: "22:00-08:00"
  timezone: "UTC"
`;
    writeFileSync(customPath, configContent);
    process.env.STEWARD_CONFIG_PATH = customPath;

    const config = await loadConfig();

    assert.equal(config.goals[0].text, 'Custom goal');
  });
});
