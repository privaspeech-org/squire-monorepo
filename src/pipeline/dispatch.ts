import { StewardConfig } from '../config.js';
import { Task } from './analyze.js';
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

  // Respect concurrency limits
  const maxConcurrent = squireConfig.max_concurrent || 3;
  const activeTasks = getActiveSquireTasks();
  const available = maxConcurrent - activeTasks;

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
      const escapedPrompt = task.prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      
      const output = execSync(
        `squire new ${repo} "${escapedPrompt}" --model ${model}`,
        { encoding: 'utf-8' }
      );
      
      // Extract task ID from output
      const match = output.match(/Created task (\w+)/);
      const taskId = match ? match[1] : 'unknown';
      
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

function getActiveSquireTasks(): number {
  try {
    const output = execSync('squire ps', { encoding: 'utf-8' });
    const lines = output.trim().split('\n').filter(l => l.includes('RUNNING'));
    return lines.length;
  } catch {
    return 0;
  }
}
