import { StewardConfig, loadGoals } from '../config.js';
import { collectSignals, Signal, autoMergePRs } from './collect.js';
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

  // Auto-merge step for high-confidence Greptile reviews
  if (config.auto_merge?.enabled) {
    console.log('🔀 Checking for auto-merge candidates...');
    const minConfidence = config.auto_merge.min_confidence || 5;
    const { success, failed, details } = autoMergePRs(signals, minConfidence);
    
    if (details.length > 0) {
      console.log(`   Auto-merge results: ${success} merged, ${failed} failed`);
      if (options.verbose) {
        for (const detail of details) {
          console.log(`     - PR #${detail.prNumber} in ${detail.repo} (confidence: ${detail.confidence}/5): ${detail.merged ? '✓ merged' : '✗ failed'}`);
        }
      }
    } else {
      console.log('   No auto-merge candidates found');
    }
    console.log('');
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
