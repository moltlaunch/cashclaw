import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { CashClawConfig } from '../config.js';

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

export interface EnvironmentCheck {
  name: string;
  check: () => Promise<boolean> | boolean;
  errorMessage: string;
  required: boolean;
}

export class StartupValidator {
  private config: CashClawConfig;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(config: CashClawConfig) {
    this.config = config;
  }

  async validateStartup(): Promise<ValidationResult> {
    this.errors = [];
    this.warnings = [];

    await this.validateEnvironment();
    await this.validateConfiguration();
    await this.validateDependencies();
    await this.validateSolanaConnection();
    await this.validateFileSystem();

    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
    };
  }

  private async validateEnvironment(): Promise<void> {
    const checks: EnvironmentCheck[] = [
      {
        name: 'Node.js version',
        check: () => this.checkNodeVersion(),
        errorMessage: 'Node.js version 18.0.0 or higher is required',
        required: true,
      },
      {
        name: 'Environment variables',
        check: () => this.checkRequiredEnvVars(),
        errorMessage: 'Required environment variables are missing',
        required: true,
      },
      {
        name: 'Memory availability',
        check: () => this.checkMemoryAvailability(),
        errorMessage: 'Insufficient memory available (minimum 512MB required)',
        required: false,
      },
    ];

    for (const check of checks) {
      try {
        const result = await check.check();
        if (!result) {
          if (check.required) {
            this.errors.push(`${check.name}: ${check.errorMessage}`);
          } else {
            this.warnings.push(`${check.name}: ${check.errorMessage}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.errors.push(`${check.name} validation failed: ${message}`);
      }
    }
  }

  private checkNodeVersion(): boolean {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split('.')[0], 10);
    return majorVersion >= 18;
  }

  private checkRequiredEnvVars(): boolean {
    const required = ['PRIVATE_KEY', 'RPC_URL'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
      this.errors.push(`Missing required environment variables: ${missing.join(', ')}`);
      return false;
    }
    return true;
  }

  private checkMemoryAvailability(): boolean {
    const totalMemory = require('os').totalmem();
    const freeMemory = require('os').freemem();
    const availableMemory = freeMemory / (1024 * 1024); // Convert to MB

    return availableMemory >= 512;
  }

  private async validateConfiguration(): Promise<void> {
    try {
      if (!this.config.agentAddress) {
        this.errors.push('Configuration error: agentAddress is required');
      }

      if (!this.config.rpcUrl) {
        this.errors.push('Configuration error: rpcUrl is required');
      }

      if (!this.config.privateKey) {
        this.errors.push('Configuration error: privateKey is required');
      }

      if (this.config.maxTasksPerBatch <= 0) {
        this.warnings.push('Configuration warning: maxTasksPerBatch should be greater than 0');
      }

      if (this.config.pollInterval < 1000) {
        this.warnings.push('Configuration warning: pollInterval less than 1000ms may cause performance issues');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown configuration error';
      this.errors.push(`Configuration validation failed: ${message}`);
    }
  }

  private async validateDependencies(): Promise<void> {
    try {
      const packageJsonPath = this.findPackageJson();
      if (!packageJsonPath) {
        this.errors.push('package.json not found');
        return;
      }

      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

      const criticalDeps = [
        '@solana/web3.js',
        '@solana/spl-token',
        'vitest',
        'typescript'
      ];

      for (const dep of criticalDeps) {
        if (!dependencies[dep]) {
          this.errors.push(`Missing critical dependency: ${dep}`);
        }
      }

      await this.checkDependencyInstallation();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown dependency error';
      this.errors.push(`Dependency validation failed: ${message}`);
    }
  }

  private findPackageJson(): string | null {
    let currentDir = process.cwd();

    for (let i = 0; i < 5; i++) {
      const packagePath = join(currentDir, 'package.json');
      if (existsSync(packagePath)) {
        return packagePath;
      }
      const parentDir = resolve(currentDir, '..');
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    return null;
  }

  private async checkDependencyInstallation(): Promise<void> {
    try {
      await import('@solana/web3.js');
    } catch {
      this.errors.push('Solana Web3.js not properly installed - run npm install');
    }

    try {
      await import('vitest');
    } catch {
      this.warnings.push('Vitest not available - testing features may not work');
    }
  }

  private async validateSolanaConnection(): Promise<void> {
    try {
      const { Connection, PublicKey } = await import('@solana/web3.js');
      const connection = new Connection(this.config.rpcUrl);

      const health = await Promise.race([
        connection.getVersion(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), 10000))
      ]);

      if (!health) {
        this.errors.push('Cannot connect to Solana RPC endpoint');
      }

      if (this.config.agentAddress) {
        try {
          new PublicKey(this.config.agentAddress);
        } catch {
          this.errors.push('Invalid agent address format');
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Solana connection error';
      this.errors.push(`Solana connection validation failed: ${message}`);
    }
  }

  private async validateFileSystem(): Promise<void> {
    const requiredDirs = ['src', 'src/llm', 'src/tools', 'src/moltlaunch'];
    const requiredFiles = ['src/config.js', 'package.json'];

    for (const dir of requiredDirs) {
      if (!existsSync(dir)) {
        this.errors.push(`Required directory missing: ${dir}`);
      }
    }

    for (const file of requiredFiles) {
      if (!existsSync(file)) {
        this.errors.push(`Required file missing: ${file}`);
      }
    }

    try {
      const tempFile = join(process.cwd(), '.cashclaw-temp');
      require('fs').writeFileSync(tempFile, 'test');
      require('fs').unlinkSync(tempFile);
    } catch {
      this.warnings.push('Write permissions may be limited in current directory');
    }
  }

  static async performStartupValidation(config: CashClawConfig): Promise<ValidationResult> {
    const validator = new StartupValidator(config);
    return await validator.validateStartup();
  }
}

export function formatValidationErrors(result: ValidationResult): string {
  let output = '';

  if (result.errors.length > 0) {
    output += '❌ Startup validation failed:\n\n';
    result.errors.forEach((error, index) => {
      output += `${index + 1}. ${error}\n`;
    });
    output += '\n';
  }

  if (result.warnings.length > 0) {
    output += '⚠️  Warnings:\n\n';
    result.warnings.forEach((warning, index) => {
      output += `${index + 1}. ${warning}\n`;
    });
    output += '\n';
  }

  if (!result.success) {
    output += 'Please fix the above errors before starting the application.\n';
    output += 'For help, check the documentation or create an issue on GitHub.\n';
  } else if (result.warnings.length > 0) {
    output += 'Application can start but consider addressing the warnings above.\n';
  } else {
    output += '✅ All startup validations passed successfully.\n';
  }

  return output;
}
