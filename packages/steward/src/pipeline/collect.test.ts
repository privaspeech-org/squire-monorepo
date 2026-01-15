import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseGreptileBody,
  parseGreptileConfidence,
  canAutoMerge,
  filterAutoMergeCandidates,
  type Signal,
} from './collect.js';

describe('parseGreptileBody', () => {
  it('should parse a valid Greptile comment', () => {
    const body = `File: src/components/Button.tsx
Line: 42
Issue: Missing null check before accessing property`;

    const result = parseGreptileBody(body);

    assert.ok(result, 'Should parse successfully');
    assert.equal(result!.file, 'src/components/Button.tsx');
    assert.equal(result!.line, 42);
    assert.equal(result!.description, 'Missing null check before accessing property');
  });

  it('should parse comment with confidence score', () => {
    const body = `File: src/utils/helpers.ts
Line: 15
Issue: Potential memory leak in event handler
Confidence Score: 4 / 5`;

    const result = parseGreptileBody(body);

    assert.ok(result, 'Should parse successfully');
    assert.equal(result!.file, 'src/utils/helpers.ts');
    assert.equal(result!.line, 15);
    assert.equal(result!.confidence, 4);
  });

  it('should handle comment without line number', () => {
    const body = `File: src/app.ts
Issue: Consider adding error boundaries`;

    const result = parseGreptileBody(body);

    assert.ok(result, 'Should parse successfully');
    assert.equal(result!.file, 'src/app.ts');
    assert.equal(result!.line, 0);
    assert.equal(result!.description, 'Consider adding error boundaries');
  });

  it('should return null for invalid format (no file)', () => {
    const body = 'Some random comment without proper format';

    const result = parseGreptileBody(body);

    assert.equal(result, null);
  });

  it('should return null for missing issue description', () => {
    const body = `File: src/test.ts
Line: 10`;

    const result = parseGreptileBody(body);

    assert.equal(result, null);
  });

  it('should handle confidence score with different denominators', () => {
    const body = `File: src/test.ts
Issue: Test issue
Confidence Score: 8 / 10`;

    const result = parseGreptileBody(body);

    assert.ok(result);
    // 8/10 scaled to 5 = 4
    assert.equal(result!.confidence, 4);
  });
});

describe('parseGreptileConfidence', () => {
  it('should parse confidence from PR body', () => {
    const body = `## Review Summary
Some review text here.

Confidence Score: 5 / 5

More text.`;

    const confidence = parseGreptileConfidence(body);
    assert.equal(confidence, 5);
  });

  it('should handle lower case', () => {
    const body = 'confidence score: 3 / 5';
    const confidence = parseGreptileConfidence(body);
    assert.equal(confidence, 3);
  });

  it('should return undefined when no confidence score', () => {
    const body = 'Just a regular comment without score';
    const confidence = parseGreptileConfidence(body);
    assert.equal(confidence, undefined);
  });

  it('should scale from 10-point to 5-point scale', () => {
    const body = 'Confidence Score: 10 / 10';
    const confidence = parseGreptileConfidence(body);
    assert.equal(confidence, 5);
  });

  it('should handle zero denominator gracefully', () => {
    const body = 'Confidence Score: 5 / 0';
    const confidence = parseGreptileConfidence(body);
    assert.equal(confidence, undefined);
  });
});

describe('canAutoMerge', () => {
  function createSignal(type: string, confidence?: number): Signal {
    return {
      source: 'github',
      type,
      data: { repo: 'owner/repo', prNumber: 123 },
      timestamp: new Date(),
      greptile_confidence: confidence,
    };
  }

  it('should return true for greptile_review with high confidence', () => {
    const signal = createSignal('greptile_review', 5);
    assert.equal(canAutoMerge(signal), true);
  });

  it('should return false for low confidence', () => {
    const signal = createSignal('greptile_review', 3);
    assert.equal(canAutoMerge(signal), false);
  });

  it('should return false for non-greptile signals', () => {
    const signal = createSignal('open_pr', 5);
    assert.equal(canAutoMerge(signal), false);
  });

  it('should return false when confidence is undefined', () => {
    const signal = createSignal('greptile_review', undefined);
    assert.equal(canAutoMerge(signal), false);
  });

  it('should use custom minConfidence threshold', () => {
    const signal = createSignal('greptile_review', 3);
    assert.equal(canAutoMerge(signal, 3), true);
    assert.equal(canAutoMerge(signal, 4), false);
  });
});

describe('filterAutoMergeCandidates', () => {
  function createSignal(type: string, confidence?: number, prNumber = 1): Signal {
    return {
      source: 'github',
      type,
      data: { repo: 'owner/repo', prNumber },
      timestamp: new Date(),
      greptile_confidence: confidence,
    };
  }

  it('should filter to only high-confidence greptile reviews', () => {
    const signals: Signal[] = [
      createSignal('greptile_review', 5, 1),
      createSignal('greptile_review', 3, 2),
      createSignal('open_pr', undefined, 3),
      createSignal('greptile_review', 5, 4),
    ];

    const candidates = filterAutoMergeCandidates(signals);

    assert.equal(candidates.length, 2);
    assert.equal((candidates[0].data as any).prNumber, 1);
    assert.equal((candidates[1].data as any).prNumber, 4);
  });

  it('should return empty array when no candidates', () => {
    const signals: Signal[] = [
      createSignal('open_pr', undefined),
      createSignal('failed_ci', undefined),
    ];

    const candidates = filterAutoMergeCandidates(signals);
    assert.deepEqual(candidates, []);
  });

  it('should respect custom minConfidence', () => {
    const signals: Signal[] = [
      createSignal('greptile_review', 4, 1),
      createSignal('greptile_review', 3, 2),
    ];

    const candidates = filterAutoMergeCandidates(signals, 4);
    assert.equal(candidates.length, 1);
  });
});
