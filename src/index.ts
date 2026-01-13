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

const program = new Command();

program
  .name('jules')
  .description('Async coding agent - fire and forget, come back to a PR')
  .version('0.1.0');

program.addCommand(newCommand);
program.addCommand(listCommand);
program.addCommand(statusCommand);
program.addCommand(logsCommand);
program.addCommand(startCommand);
program.addCommand(stopCommand);
program.addCommand(cleanCommand);
program.addCommand(configCommand);
program.addCommand(followupCommand);
program.addCommand(psCommand);

program.parse();
