import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  setLogLevel,
  getLogLevel,
  setVerbose,
  createLogger,
  debug,
  info,
  warn,
  error,
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
    // Reset log level
    setLogLevel('info');
  });

  afterEach(() => {
    // Restore stdout
    process.stdout.write = originalStdoutWrite;
    // Reset to default
    setLogLevel('info');
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
});
