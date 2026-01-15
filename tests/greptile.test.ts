import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseGreptileBody, parseGreptileConfidence } from '../dist/pipeline/collect.js';

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

  it('should parse confidence score 4/5', () => {
    const body = 'File: src/utils.ts\nLine: 42\nIssue: TypeScript error - variable might be undefined\nConfidence Score: 4/5';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.file, 'src/utils.ts');
    assert.strictEqual(result?.line, 42);
    assert.strictEqual(result?.description, 'TypeScript error - variable might be undefined');
    assert.strictEqual(result?.confidence, 4);
  });

  it('should parse confidence score 5/5', () => {
    const body = 'File: src/utils.ts\nLine: 42\nIssue: Critical bug fix\nConfidence Score: 5/5';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.confidence, 5);
  });

  it('should parse confidence score 2/5', () => {
    const body = 'File: src/utils.ts\nLine: 42\nIssue: Minor improvement suggestion\nConfidence Score: 2/5';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.confidence, 2);
  });

  it('should parse confidence score with different formats', () => {
    const body1 = 'File: src/utils.ts\nLine: 42\nIssue: Test issue\nConfidence Score: 3/5';
    const body2 = 'File: src/utils.ts\nLine: 42\nIssue: Test issue\nConfidence Score: 3 / 5';
    const body3 = 'File: src/utils.ts\nLine: 42\nIssue: Test issue\nconfidence score: 3/5';

    const result1 = parseGreptileBody(body1);
    const result2 = parseGreptileBody(body2);
    const result3 = parseGreptileBody(body3);

    assert.strictEqual(result1?.confidence, 3);
    assert.strictEqual(result2?.confidence, 3);
    assert.strictEqual(result3?.confidence, 3);
  });

  it('should not set confidence when not present', () => {
    const body = 'File: src/utils.ts\nLine: 42\nIssue: Some issue without confidence';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.confidence, undefined);
  });

  it('should handle invalid confidence scores gracefully', () => {
    const body = 'File: src/utils.ts\nLine: 42\nIssue: Issue with invalid confidence\nConfidence Score: invalid/5';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.confidence, undefined);
    assert.ok(result !== null);
    assert.strictEqual(result?.file, 'src/utils.ts');
  });

  it('should parse confidence score in HTML h3 format', () => {
    const body = '<h3>Confidence Score: 4/5</h3>\nFile: src/utils.ts\nLine: 42\nIssue: TypeScript error';
    const result = parseGreptileBody(body);
    assert.strictEqual(result?.confidence, 4);
  });
});

describe('parseGreptileConfidence', () => {
  it('should parse confidence score from PR body', () => {
    const body = 'Some PR description\n<h3>Confidence Score: 3/5</h3>\nMore details';
    const result = parseGreptileConfidence(body);
    assert.strictEqual(result, 3);
  });

  it('should return undefined when no confidence score in PR body', () => {
    const body = 'Some PR description without confidence score';
    const result = parseGreptileConfidence(body);
    assert.strictEqual(result, undefined);
  });

  it('should parse confidence score with different formats', () => {
    const body1 = 'Confidence Score: 4/5';
    const body2 = 'confidence score: 2/5';
    const body3 = 'PR body with Confidence Score: 5/5 here';

    assert.strictEqual(parseGreptileConfidence(body1), 4);
    assert.strictEqual(parseGreptileConfidence(body2), 2);
    assert.strictEqual(parseGreptileConfidence(body3), 5);
  });
});
