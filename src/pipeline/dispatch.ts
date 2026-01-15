import { StewardConfig } from '../config.js';
import { Task } from './analyze.js';
import { recordTask, getActiveTasks } from '../state.js';
import { execSync } from 'child_process';

export interface DispatchedTask extends Task {
  taskId: string;
  status: 'dispatched' | 'failed';
}

export async function dispatchTasks(
  config: StewardConfig,
  tasks: Task[]
): Promise<DispatchedTask[]> {
  const dispatched: DispatchedTask[] = [];
  const squireConfig = config.execution.squire;
  
  if (!squireConfig) {
    throw new Error('Squire config not found');
  }

  // Respect concurrency limits (check both Squire and our state)
  const maxConcurrent = squireConfig.max_concurrent || 3;
  const activeTasks = getActiveTasks().length;
  const squireActive = getSquireRunningCount();
  const currentActive = Math.max(activeTasks, squireActive);
  const available = maxConcurrent - currentActive;

  if (available <= 0) {
    console.log(`   Max concurrent tasks (${maxConcurrent}) reached, skipping dispatch`);
    return [];
  }

  const toDispatch = tasks.slice(0, available);

  for (const task of toDispatch) {
    try {
      const repo = task.repo || squireConfig.default_repo;
      const model = squireConfig.model;
      
      // Escape the prompt for shell
      const escapedPrompt = task.prompt
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, ' ')
        .replace(/\$/g, '\\$');
      
      const output = execSync(
        `squire new ${repo} "${escapedPrompt}" --model ${model}`,
        { encoding: 'utf-8', timeout: 30000 }
      );
      
      // Extract task ID from output
      const match = output.match(/Created task (\w+)/);
      const taskId = match ? match[1] : `unknown-${Date.now()}`;
      
      // Record to state
      recordTask({
        taskId,
        repo,
        prompt: task.prompt,
        status: 'dispatched',
      });
      
      dispatched.push({
        ...task,
        taskId,
        status: 'dispatched',
      });
      
      console.log(`   ✓ Dispatched ${taskId}: ${task.prompt.slice(0, 40)}...`);
    } catch (err) {
      console.error(`   ✗ Failed to dispatch: ${task.prompt.slice(0, 40)}...`);
      dispatched.push({
        ...task,
        taskId: '',
        status: 'failed',
      });
    }
  }

  return dispatched;
}

function getSquireRunningCount(): number {
  try {
    const output = execSync('squire ps', { encoding: 'utf-8' });
    const lines = output.trim().split('\n').filter(l => l.includes('RUNNING'));
    return lines.length;
  } catch {
    return 0;
  }
}
