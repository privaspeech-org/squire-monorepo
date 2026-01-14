import { StewardConfig, loadGoals } from '../config.js';
import { collectSignals, Signal } from './collect.js';
import { analyzeTasks, Task } from './analyze.js';
import { dispatchTasks } from './dispatch.js';
import { monitorTasks } from './monitor.js';
import { reportProgress } from './report.js';

interface PipelineOptions {
  dryRun: boolean;
  verbose: boolean;
}

export async function runPipeline(
  config: StewardConfig,
  options: PipelineOptions
): Promise<void> {
  console.log('🏰 Running Steward pipeline...\n');

  // 1. COLLECT - Gather signals
  console.log('📡 Collecting signals...');
  const signals = await collectSignals(config);
  console.log(`   Found ${signals.length} signals\n`);

  if (signals.length === 0) {
    console.log('   No signals to process. Done.');
    return;
  }

  // 2. ANALYZE - Generate tasks from signals + goals
  console.log('🧠 Analyzing signals against goals...');
  const goals = loadGoals(config);
  const tasks = await analyzeTasks(config, goals, signals);
  console.log(`   Generated ${tasks.length} tasks\n`);

  if (tasks.length === 0) {
    console.log('   No tasks to dispatch. Done.');
    return;
  }

  // Show tasks
  for (const task of tasks) {
    console.log(`   - [${task.priority}] ${task.repo}: ${task.prompt.slice(0, 60)}...`);
  }
  console.log('');

  if (options.dryRun) {
    console.log('🔍 Dry run - not dispatching tasks');
    return;
  }

  // 3. DISPATCH - Send to Squire
  console.log('🛡️ Dispatching to Squire...');
  const dispatched = await dispatchTasks(config, tasks);
  console.log(`   Dispatched ${dispatched.length} tasks\n`);

  // 4. MONITOR - Track completion (optional immediate check)
  console.log('👁️ Monitoring...');
  await monitorTasks(config, dispatched);

  // 5. REPORT - Notify human
  console.log('📢 Reporting...');
  await reportProgress(config, dispatched);

  console.log('\n🏰 Pipeline complete');
}
