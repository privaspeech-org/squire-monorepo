#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { runPipeline } from './pipeline/index.js';

const program = new Command();

program
  .name('steward')
  .description('Task orchestrator that turns goals into coding tasks')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize a steward workspace')
  .action(async () => {
    console.log('🏰 Initializing Steward workspace...');
    // TODO: Create steward.yaml template
    console.log('Created steward.yaml');
  });

program
  .command('run')
  .description('Run one cycle of the pipeline')
  .option('--dry-run', 'Show what would be dispatched without executing')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    const config = await loadConfig();
    await runPipeline(config, {
      dryRun: options.dryRun,
      verbose: options.verbose,
    });
  });

program
  .command('watch')
  .description('Run continuously at interval')
  .option('--interval <minutes>', 'Minutes between runs', '30')
  .action(async (options) => {
    const config = await loadConfig();
    const intervalMs = parseInt(options.interval) * 60 * 1000;

    console.log(`🏰 Steward watching (every ${options.interval}m)...`);

    const tick = async () => {
      try {
        await runPipeline(config, { dryRun: false, verbose: false });
      } catch (err) {
        console.error('Pipeline error:', err);
      }
    };

    await tick();
    setInterval(tick, intervalMs);
  });

program
  .command('status')
  .description('Show current state')
  .action(async () => {
    // TODO: Show active tasks, recent signals, etc.
    console.log('🏰 Steward Status');
  });

program
  .command('signals')
  .description('List collected signals')
  .action(async () => {
    const config = await loadConfig();
    // TODO: Collect and display signals
    console.log('📡 Signals:');
  });

program.parse();
