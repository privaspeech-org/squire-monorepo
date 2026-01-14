import { StewardConfig } from '../config.js';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';

export interface Signal {
  source: 'github' | 'posthog' | 'file';
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
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
