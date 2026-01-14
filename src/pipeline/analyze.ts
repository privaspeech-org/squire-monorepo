import { StewardConfig } from '../config.js';
import { Signal } from './collect.js';
import { getActiveTasks, getRecentTasks, getFailedTasks, syncWithSquire } from '../state.js';
import OpenAI from 'openai';

export interface Task {
  repo: string;
  prompt: string;
  priority: 'high' | 'medium' | 'low';
  depends_on: string[];
}

export async function analyzeTasks(
  config: StewardConfig,
  goals: string,
  signals: Signal[]
): Promise<Task[]> {
  // Sync state with Squire before analyzing
  syncWithSquire();
  
  const openai = new OpenAI();
  
  // Gather context
  const signalSummary = signals.map(s => 
    `[${s.source}/${s.type}] ${JSON.stringify(s.data)}`
  ).join('\n');

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

Respond with a JSON array:
[{ "repo": "owner/repo", "prompt": "detailed task description", "priority": "high|medium|low", "depends_on": [] }]

If no NEW tasks are needed, respond with an empty array: []`;

  const response = await openai.chat.completions.create({
    model: config.llm.model,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '[]';
  
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : parsed.tasks || [];
  } catch {
    console.error('Failed to parse LLM response:', content);
    return [];
  }
}
