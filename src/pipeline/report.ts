import { StewardConfig } from '../config.js';
import { DispatchedTask } from './dispatch.js';

export async function reportProgress(
  config: StewardConfig,
  tasks: DispatchedTask[]
): Promise<void> {
  if (tasks.length === 0) return;

  const successful = tasks.filter(t => t.status === 'dispatched');
  const failed = tasks.filter(t => t.status === 'failed');

  const message = [
    '🏰 Steward Report',
    '',
    `Dispatched: ${successful.length}`,
    ...successful.map(t => `  • ${t.taskId}: ${t.prompt.slice(0, 50)}...`),
  ];

  if (failed.length > 0) {
    message.push('', `Failed: ${failed.length}`);
    message.push(...failed.map(t => `  • ${t.prompt.slice(0, 50)}...`));
  }

  const text = message.join('\n');
  console.log(`\n${text}`);

  // TODO: Send to configured notify channels
  // if (config.notify?.telegram) { ... }
  // if (config.notify?.slack) { ... }
}
