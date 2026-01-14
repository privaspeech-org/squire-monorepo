import { StewardConfig } from '../config.js';
import { Signal } from './collect.js';
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
  const openai = new OpenAI();
  
  const signalSummary = signals.map(s => 
    `[${s.source}/${s.type}] ${JSON.stringify(s.data)}`
  ).join('\n');

  const prompt = `You are a software development orchestrator. Given the goals and current signals, determine what coding tasks should be created.

GOALS:
${goals}

CURRENT SIGNALS:
${signalSummary}

What coding tasks should be created? Respond with JSON array:
[{ "repo": "owner/repo", "prompt": "detailed task", "priority": "high|medium|low", "depends_on": [] }]

Focus on: CI failures (high), actionable issues, progress toward goals.
Skip: PRs needing review, vague signals, out-of-scope work.

If no tasks needed, respond with []`;

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
