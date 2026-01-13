#!/usr/bin/env node

import { Command } from 'commander';
import { newCommand } from './commands/new.js';
import { listCommand } from './commands/list.js';
import { statusCommand } from './commands/status.js';
import { logsCommand } from './commands/logs.js';
import { startCommand } from './commands/start.js';
import { stopCommand } from './commands/stop.js';
import { cleanCommand } from './commands/clean.js';
import { configCommand } from './commands/config.js';
import { followupCommand } from './commands/followup.js';
import { psCommand } from './commands/ps.js';
import { retryCommand } from './commands/retry.js';
import { watchCommand } from './commands/watch.js';
import { webhookCommand } from './commands/webhook.js';

const program = new Command();

program
  .name('squire')
  .description('Your trusty squire for background coding tasks - fire and forget, come back to a PR')
  .version('0.1.0');

// Core commands
program.addCommand(newCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(logsCommand);

// Task management
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(retryCommand);
program.addCommand(followupCommand);

// Monitoring
program.addCommand(psCommand);
program.addCommand(watchCommand);
program.addCommand(webhookCommand);

// Maintenance
program.addCommand(cleanCommand);
program.addCommand(configCommand);

program.parse();
