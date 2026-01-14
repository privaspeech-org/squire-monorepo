import { StewardConfig } from '../config.js';
import { DispatchedTask } from './dispatch.js';
import { execSync } from 'child_process';

export async function monitorTasks(
  config: StewardConfig,
  tasks: DispatchedTask[]
): Promise<void> {
  // Quick status check - not blocking
  for (const task of tasks) {
    if (task.status !== 'dispatched' || !task.taskId) continue;
    
    try {
      const output = execSync(`squire status ${task.taskId}`, { encoding: 'utf-8' });
      const status = output.includes('COMPLETED') ? 'completed' :
                     output.includes('FAILED') ? 'failed' :
                     output.includes('RUNNING') ? 'running' : 'unknown';
      console.log(`   ${task.taskId}: ${status}`);
    } catch {
      console.log(`   ${task.taskId}: status unknown`);
    }
  }
}
