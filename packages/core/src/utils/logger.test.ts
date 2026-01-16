import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setLogLevel,
  getLogLevel,
  setVerbose,
  setQuiet,
  createLogger,
  debug,
  info,
  warn,
  error,
  audit,
  type LogLevel,
} from './logger.js';

describe('Logger', () => {
  let originalStdoutWrite: typeof process.stdout.write;
  let capturedOutput: string[];

  beforeEach(() => {
    // Capture stdout
    capturedOutput = [];
    originalStdoutWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      capturedOutput.push(chunk.toString());
      return true;
    };
    // Reset log level and quiet mode
    setLogLevel('info');
    setQuiet(false);
  });

  afterEach(() => {
    // Restore stdout
    process.stdout.write = originalStdoutWrite;
    // Reset to default
    setLogLevel('info');
    setQuiet(false);
  });

  describe('setLogLevel / getLogLevel', () => {
    it('should set and get log level', () => {
      setLogLevel('debug');
      assert.equal(getLogLevel(), 'debug');

      setLogLevel('warn');
      assert.equal(getLogLevel(), 'warn');
    });
  });

  describe('setVerbose', () => {
    it('should set log level to debug when verbose is enabled', () => {
      setVerbose(true);
      assert.equal(getLogLevel(), 'debug');
    });

    it('should disable quiet mode when verbose is enabled', () => {
      setQuiet(true);
      info('test', 'Should not appear');
      assert.equal(capturedOutput.length, 0);

      setVerbose(true);
      info('test', 'Should appear');
      assert.equal(capturedOutput.length, 1);
    });
  });

  describe('setQuiet', () => {
    it('should suppress all logs when quiet mode is enabled', () => {
      setQuiet(true);

      debug('test', 'Debug');
      info('test', 'Info');
      warn('test', 'Warn');
      error('test', 'Error');

      assert.equal(capturedOutput.length, 0);
    });

    it('should allow logs when quiet mode is disabled', () => {
      setQuiet(true);
      setQuiet(false);

      info('test', 'Should appear');
      assert.equal(capturedOutput.length, 1);
    });

    it('should take precedence over log level', () => {
      setLogLevel('debug');
      setQuiet(true);

      debug('test', 'Debug');
      info('test', 'Info');
      warn('test', 'Warn');
      error('test', 'Error');

      assert.equal(capturedOutput.length, 0);
    });
  });

  describe('log level filtering', () => {
    it('should log messages at or above current level', () => {
      setLogLevel('info');

      info('test', 'Info message');
      warn('test', 'Warn message');
      error('test', 'Error message');

      assert.equal(capturedOutput.length, 3);
    });

    it('should not log messages below current level', () => {
      setLogLevel('warn');

      debug('test', 'Debug message');
      info('test', 'Info message');
      warn('test', 'Warn message');

      // Only warn should be logged
      assert.equal(capturedOutput.length, 1);
      assert.ok(capturedOutput[0].includes('warn'));
    });

    it('should log debug messages when level is debug', () => {
      setLogLevel('debug');

      debug('test', 'Debug message');

      assert.equal(capturedOutput.length, 1);
      assert.ok(capturedOutput[0].includes('debug'));
    });
  });

  describe('log output format', () => {
    it('should output JSON formatted logs', () => {
      info('test-component', 'Test message');

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.level, 'info');
      assert.equal(logged.component, 'test-component');
      assert.equal(logged.message, 'Test message');
      assert.ok(logged.timestamp, 'Should have timestamp');
    });

    it('should include metadata in logs', () => {
      info('test', 'Message with data', { key: 'value', count: 42 });

      const logged = JSON.parse(capturedOutput[0]);
      assert.deepEqual(logged.metadata, { key: 'value', count: 42 });
    });
  });

  describe('createLogger', () => {
    it('should create a logger with fixed component name', () => {
      const logger = createLogger('my-component');

      logger.info('Test message');

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.component, 'my-component');
    });

    it('should have all log level methods', () => {
      setLogLevel('debug');
      const logger = createLogger('test');

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      assert.equal(capturedOutput.length, 4);
    });

    it('should pass metadata through', () => {
      const logger = createLogger('test');

      logger.info('Message', { extra: 'data' });

      const logged = JSON.parse(capturedOutput[0]);
      assert.deepEqual(logged.metadata, { extra: 'data' });
    });
  });

  describe('log sanitization', () => {
    it('should redact sensitive keys', () => {
      info('test', 'Test message', {
        githubToken: 'ghp_1234567890abcdefghij',
        apiKey: 'sk-1234567890',
        password: 'secret123',
        normalField: 'normal value',
      });

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.metadata.githubToken, '[REDACTED]');
      assert.equal(logged.metadata.apiKey, '[REDACTED]');
      assert.equal(logged.metadata.password, '[REDACTED]');
      assert.equal(logged.metadata.normalField, 'normal value');
    });

    it('should redact nested sensitive keys', () => {
      info('test', 'Test message', {
        config: {
          token: 'abc123',
          setting: 'value',
        },
      });

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.metadata.config.token, '[REDACTED]');
      assert.equal(logged.metadata.config.setting, 'value');
    });

    it('should handle arrays with sensitive data', () => {
      info('test', 'Test message', {
        items: [
          { token: 'secret', name: 'item1' },
          { key: 'value', name: 'item2' },
        ],
      });

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.metadata.items[0].token, '[REDACTED]');
      assert.equal(logged.metadata.items[0].name, 'item1');
      assert.equal(logged.metadata.items[1].name, 'item2');
    });

    it('should sanitize long alphanumeric strings', () => {
      info('test', 'Test message', {
        nonSensitiveKey: 'ghp_very_long_token_that_looks_suspicious_12345678901234567890',
      });

      const logged = JSON.parse(capturedOutput[0]);
      // Should show first and last 4 characters
      assert.match(logged.metadata.nonSensitiveKey as string, /^ghp_\.\.\.7890$/);
    });

    it('should not sanitize short strings', () => {
      info('test', 'Test message', {
        shortValue: 'abc',
      });

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.metadata.shortValue, 'abc');
    });
  });

  describe('audit logging', () => {
    it('should log security audit events', () => {
      audit('security', 'token_access', {
        userId: 'user123',
        resource: 'github_token',
      });

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.level, 'info');
      assert.equal(logged.component, 'security');
      assert.equal(logged.message, 'Security audit: token_access');
      assert.equal(logged.metadata.audit, true);
      assert.equal(logged.metadata.operation, 'token_access');
      assert.equal(logged.metadata.userId, 'user123');
    });

    it('should be available via createLogger', () => {
      const logger = createLogger('security');

      logger.audit('config_change', {
        field: 'maxConcurrent',
        oldValue: 5,
        newValue: 10,
      });

      const logged = JSON.parse(capturedOutput[0]);
      assert.equal(logged.metadata.audit, true);
      assert.equal(logged.metadata.operation, 'config_change');
    });
  });
});
