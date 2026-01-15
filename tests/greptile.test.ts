import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseGreptileBody } from '../dist/pipeline/collect.js';

describe('parseGreptileBody', () => {
  it('should parse a valid Greptile comment with file, line, and issue', () => {
    const body = 'File: src/utils.ts\nLine: 42\nIssue: TypeScript error - variable might be undefined';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.file, 'src/utils.ts');
    assert.strictEqual(result?.line, 42);
    assert.strictEqual(result?.description, 'TypeScript error - variable might be undefined');
  });

  it('should parse a Greptile comment without line number', () => {
    const body = 'File: src/utils.ts\nIssue: Consider using const instead of let';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.file, 'src/utils.ts');
    assert.strictEqual(result?.line, 0);
    assert.strictEqual(result?.description, 'Consider using const instead of let');
  });

  it('should return null for invalid body without file', () => {
    const body = 'Line: 10\nIssue: Something is wrong';
    const result = parseGreptileBody(body);
    assert.strictEqual(result, null);
  });

  it('should return null for invalid body without issue', () => {
    const body = 'File: src/utils.ts\nLine: 10';
    const result = parseGreptileBody(body);
    assert.strictEqual(result, null);
  });

  it('should parse a Greptile comment with HTML details format', () => {
    const body = '<details>\n<summary>Additional Comments (1)</summary>\n\nFile: src/utils.ts\nLine: 42\nIssue: Test fails because assertion is wrong\n</details>';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.file, 'src/utils.ts');
    assert.strictEqual(result?.line, 42);
    assert.strictEqual(result?.description, 'Test fails because assertion is wrong');
  });

  it('should handle complex file paths', () => {
    const body = 'File: src/components/button/Button.tsx\nLine: 15\nIssue: Missing accessibility label';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.file, 'src/components/button/Button.tsx');
    assert.strictEqual(result?.line, 15);
    assert.strictEqual(result?.description, 'Missing accessibility label');
  });
});
