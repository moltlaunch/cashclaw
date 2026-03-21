import { Command } from 'commander';
import { execSync } from 'child_process';
import { config } from '../config.js';
import type { CashClawConfig } from '../config.js';

interface RegisterOptions {
  name: string;
  description: string;
  skills: string;
  basePrice: string;
  token?: string;
}

function escapeShellArg(arg: string): string {
  // Handle empty strings
  if (!arg) return "''";

  // If the argument contains no special characters, return as-is
  if (!/['"\\$`\s|&;()<>{}[\]*?~]/.test(arg)) {
    return arg;
  }

  // Escape single quotes by ending the quoted string, adding escaped quote, and starting new quoted string
  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

function validateInput(options: RegisterOptions): string[] {
  const errors: string[] = [];

  if (!options.name || options.name.trim().length === 0) {
    errors.push('Name is required');
  }

  if (!options.description || options.description.trim().length === 0) {
    errors.push('Description is required');
  }

  if (!options.skills || options.skills.trim().length === 0) {
    errors.push('Skills are required');
  }

  if (!options.basePrice || isNaN(parseFloat(options.basePrice)) || parseFloat(options.basePrice) <= 0) {
    errors.push('Base price must be a positive number');
  }

  // Validate skills format - should be comma-separated
  if (options.skills && !/^[a-zA-Z0-9,\s-_]+$/.test(options.skills)) {
    errors.push('Skills should contain only letters, numbers, commas, spaces, hyphens, and underscores');
  }

  return errors;
}

function buildRegisterCommand(options: RegisterOptions, cfg: CashClawConfig): string {
  const escapedName = escapeShellArg(options.name.trim());
  const escapedDescription = escapeShellArg(options.description.trim());
  const escapedSkills = escapeShellArg(options.skills.trim());
  const escapedPrice = escapeShellArg(options.basePrice.trim());

  let cmd = `mltl register --name ${escapedName} --description ${escapedDescription} --skills ${escapedSkills} --base-price ${escapedPrice}`;

  if (options.token && options.token.trim().length > 0) {
    const escapedToken = escapeShellArg(options.token.trim());
    cmd += ` --token ${escapedToken}`;
  }

  // Add wallet if configured
  if (cfg.walletAddress) {
    const escapedWallet = escapeShellArg(cfg.walletAddress);
    cmd += ` --wallet ${escapedWallet}`;
  }

  return cmd;
}

export function createRegisterCommand(): Command {
  const registerCmd = new Command('register');

  registerCmd
    .description('Register agent with properly escaped arguments')
    .option('-n, --name <name>', 'Agent name')
    .option('-d, --description <description>', 'Agent description')
    .option('-s, --skills <skills>', 'Comma-separated skills list')
    .option('-p, --base-price <price>', 'Base price in tokens')
    .option('-t, --token <token>', 'Payment token (optional)')
    .action(async (options: RegisterOptions) => {
      try {
        console.log('Starting agent registration...');

        // Validate input
        const validationErrors = validateInput(options);
        if (validationErrors.length > 0) {
          console.error('Validation errors:');
          validationErrors.forEach(error => console.error(`  - ${error}`));
          process.exit(1);
        }

        // Load config
        const cfg = await config.load();

        // Build and execute command
        const command = buildRegisterCommand(options, cfg);
        console.log('Executing registration command...');

        try {
          const output = execSync(command, {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 30000 // 30 second timeout
          });

          console.log('Registration successful!');
          console.log(output);

        } catch (execError: any) {
          console.error('Registration command failed:');
          if (execError.stdout) {
            console.error('stdout:', execError.stdout);
          }
          if (execError.stderr) {
            console.error('stderr:', execError.stderr);
          }
          console.error('Command was:', command);
          process.exit(1);
        }

      } catch (error: any) {
        console.error('Registration failed:', error.message);
        process.exit(1);
      }
    });

  return registerCmd;
}
