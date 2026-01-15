import { generateText } from 'ai';
import { StewardConfig } from '../config.js';
import { Signal } from './collect.js';
import { getActiveTasks, getRecentTasks, getFailedTasks, syncWithSquire } from '../state.js';

export interface Task {
  prompt: string;
  priority: 'high' | 'medium' | 'low';
  depends_on: string[];
}

export async function analyzeTasks(
  config: StewardConfig,
  goals: string,
  signals: Signal[]
): Promise<Task[]> {
  syncWithSquire();

  function formatSignal(s: Signal): string {
    if (s.type === 'greptile_review' && s.data.parsed) {
      const p = s.data.parsed as { file: string; line: number; description: string };
      const confidence = s.greptile_confidence !== undefined ? ` [confidence: ${s.greptile_confidence}/5]` : '';
      return `[github/greptile_review] PR#${s.data.prNumber}: ${p.file}:${p.line} - ${p.description}${confidence}`;
    }
    return `[${s.source}/${s.type}] ${JSON.stringify(s.data)}`;
  }

  const signalSummary = signals.map(formatSignal).join('\n');

  const activeTasks = getActiveTasks();
  const activeTasksSummary = activeTasks.length > 0
    ? activeTasks.map(t => `- [${t.taskId}] ${t.repo}: ${t.prompt.slice(0, 80)}...`).join('\n')
    : 'None';

  const recentTasks = getRecentTasks(7);
  const recentTasksSummary = recentTasks.length > 0
    ? recentTasks.map(t => `- ${t.repo}: ${t.prompt.slice(0, 80)}... → ${t.prUrl || 'completed'}`).join('\n')
    : 'None';

  const failedTasks = getFailedTasks(7);
  const failedTasksSummary = failedTasks.length > 0
    ? failedTasks.map(t => `- ${t.repo}: ${t.prompt.slice(0, 80)}...`).join('\n')
    : 'None';

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

  const result = await generateText({
    model: config.llm.model,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = result.text || '[]';

  let jsonContent = content.trim();
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonContent);
    return Array.isArray(parsed) ? parsed : parsed.tasks || [];
  } catch {
    console.error('Failed to parse LLM response:', content);
    return [];
  }
}
