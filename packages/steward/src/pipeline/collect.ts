import { StewardConfig } from '../config.js';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

export interface Signal {
  source: 'github' | 'posthog' | 'file';
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
  greptile_confidence?: number;
}

export async function collectSignals(config: StewardConfig): Promise<Signal[]> {
  const signals: Signal[] = [];

  // GitHub signals
  if (config.signals.github) {
    for (const repo of config.signals.github.repos) {
      if (config.signals.github.watch.includes('open_prs')) {
        const prs = collectGitHubPRs(repo);
        signals.push(...prs);
      }
      if (config.signals.github.watch.includes('failed_ci')) {
        const failures = collectGitHubCIFailures(repo);
        signals.push(...failures);
      }
      if (config.signals.github.watch.includes('issues')) {
        const issues = collectGitHubIssues(repo);
        signals.push(...issues);
      }
      if (config.signals.github.watch.includes('greptile_reviews')) {
        const reviews = collectGreptileReviews(repo);
        signals.push(...reviews);
      }
    }
  }

  // File signals
  if (config.signals.files) {
    for (const filePath of config.signals.files) {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf-8');
        signals.push({
          source: 'file',
          type: 'manual_tasks',
          data: { path: filePath, content },
          timestamp: new Date(),
        });
      }
    }
  }

  // TODO: PostHog signals

  return signals;
}

function collectGitHubPRs(repo: string): Signal[] {
  try {
    const output = execSync(
      `gh pr list --repo ${repo} --state open --json number,title,author,createdAt,labels`,
      { encoding: 'utf-8' }
    );
    const prs = JSON.parse(output);
    return prs.map((pr: any) => ({
      source: 'github' as const,
      type: 'open_pr',
      data: { repo, ...pr },
      timestamp: new Date(pr.createdAt),
    }));
  } catch {
    return [];
  }
}

function collectGitHubCIFailures(repo: string): Signal[] {
  try {
    const output = execSync(
      `gh run list --repo ${repo} --status failure --limit 5 --json databaseId,displayTitle,conclusion,createdAt`,
      { encoding: 'utf-8' }
    );
    const runs = JSON.parse(output);
    return runs.map((run: any) => ({
      source: 'github' as const,
      type: 'failed_ci',
      data: { repo, ...run },
      timestamp: new Date(run.createdAt),
    }));
  } catch {
    return [];
  }
}

function collectGitHubIssues(repo: string): Signal[] {
  try {
    const output = execSync(
      `gh issue list --repo ${repo} --state open --json number,title,author,createdAt,labels`,
      { encoding: 'utf-8' }
    );
    const issues = JSON.parse(output);
    return issues.map((issue: any) => ({
      source: 'github' as const,
      type: 'open_issue',
      data: { repo, ...issue },
      timestamp: new Date(issue.createdAt),
    }));
  } catch {
    return [];
  }
}

export interface GreptileComment {
  file: string;
  line: number;
  description: string;
  confidence?: number;
}

export function parseGreptileBody(body: string): GreptileComment | null {
  const fileMatch = body.match(/File:\s*([^\s\n]+)/);
  const lineMatch = body.match(/Line:\s*(\d+)/);
  const descMatch = body.match(/Issue:\s*([^\n]+)/);
  const confidenceMatch = body.match(/Confidence Score:\s*(\d+)\s*\/\s*(\d+)/i);

  if (!fileMatch || !descMatch) {
    return null;
  }

  let confidence: number | undefined;
  if (confidenceMatch) {
    const numerator = parseInt(confidenceMatch[1], 10);
    const denominator = parseInt(confidenceMatch[2], 10);
    if (denominator > 0) {
      confidence = Math.round((numerator / denominator) * 5) || numerator;
    }
  }

  return {
    file: fileMatch[1],
    line: lineMatch ? parseInt(lineMatch[1], 10) : 0,
    description: descMatch[1].trim(),
    confidence,
  };
}

function collectGreptileReviews(repo: string): Signal[] {
  try {
    const prsOutput = execSync(
      `gh pr list --repo ${repo} --state open --json number`,
      { encoding: 'utf-8' }
    );
    const prs = JSON.parse(prsOutput);
    const allComments: any[] = [];

    for (const pr of prs) {
      try {
        const commentsOutput = execSync(
          `gh api repos/${repo}/pulls/${pr.number}/comments`,
          { encoding: 'utf-8' }
        );
        const comments = JSON.parse(commentsOutput);
        allComments.push(...comments.map((c: any) => ({ ...c, prNumber: pr.number })));
      } catch {
      }
    }

    const greptileComments = allComments.filter((comment: any) =>
      comment.user?.login === 'greptile-apps'
    );

    const prSignals: Signal[] = [];

    for (const pr of prs) {
      try {
        const prViewOutput = execSync(
          `gh pr view ${pr.number} --repo ${repo} --json body`,
          { encoding: 'utf-8' }
        );
        const prView = JSON.parse(prViewOutput);
        const confidence = parseGreptileConfidence(prView.body);

        if (confidence !== undefined) {
          prSignals.push({
            source: 'github' as const,
            type: 'greptile_review',
            greptile_confidence: confidence,
            data: {
              repo,
              prNumber: pr.number,
              body: prView.body,
              confidence,
            },
            timestamp: new Date(),
          });
        }
      } catch {
      }
    }

    const commentSignals = greptileComments.map((comment: any) => {
      const parsed = parseGreptileBody(comment.body);
      return {
        source: 'github' as const,
        type: 'greptile_review',
        greptile_confidence: parsed?.confidence,
        data: {
          repo,
          prNumber: comment.prNumber,
          commentId: comment.id,
          author: comment.user?.login,
          body: comment.body,
          parsed: parsed || null,
          confidence: parsed?.confidence,
        },
        timestamp: new Date(comment.created_at),
      };
    });

    return [...prSignals, ...commentSignals];
  } catch {
    return [];
  }
}

export function parseGreptileConfidence(body: string): number | undefined {
  const confidenceMatch = body.match(/Confidence Score:\s*(\d+)\s*\/\s*(\d+)/i);
  if (confidenceMatch) {
    const numerator = parseInt(confidenceMatch[1], 10);
    const denominator = parseInt(confidenceMatch[2], 10);
    if (denominator > 0) {
      return Math.round((numerator / denominator) * 5) || numerator;
    }
  }
  return undefined;
}

export function canAutoMerge(signal: Signal, minConfidence: number = 5): boolean {
  if (signal.type !== 'greptile_review') {
    return false;
  }

  const confidence = signal.greptile_confidence;
  if (confidence === undefined || confidence === null) {
    return false;
  }

  return confidence >= minConfidence;
}

export function filterAutoMergeCandidates(
  signals: Signal[],
  minConfidence: number = 5
): Signal[] {
  return signals.filter(signal => canAutoMerge(signal, minConfidence));
}

export function mergePR(repo: string, prNumber: number): boolean {
  try {
    execSync(
      `gh pr merge --repo ${repo} ${prNumber} --admin --merge`,
      { encoding: 'utf-8' }
    );
    return true;
  } catch {
    return false;
  }
}

export function autoMergePRs(
  signals: Signal[],
  minConfidence: number = 5
): { success: number; failed: number; details: Array<{ repo: string; prNumber: number; confidence: number; merged: boolean }> } {
  const candidates = filterAutoMergeCandidates(signals, minConfidence);
  const details: Array<{ repo: string; prNumber: number; confidence: number; merged: boolean }> = [];
  let success = 0;
  let failed = 0;

  const processedPRs = new Set<string>();

  for (const signal of candidates) {
    const data = signal.data as { repo: string; prNumber: number; confidence?: number };
    const key = `${data.repo}-${data.prNumber}`;

    // Skip if we've already processed this specific PR
    if (processedPRs.has(key)) {
      continue;
    }

    const merged = mergePR(data.repo, data.prNumber);
    if (merged) {
      success++;
    } else {
      failed++;
    }

    processedPRs.add(key);
    details.push({
      repo: data.repo,
      prNumber: data.prNumber,
      confidence: signal.greptile_confidence || 0,
      merged,
    });
  }

  return { success, failed, details };
}
