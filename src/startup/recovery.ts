import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import type { CashClawConfig } from '../config.js';

interface RecoveryOptions {
  autoInstall?: boolean;
  createDefaults?: boolean;
  verbose?: boolean;
}

interface DependencyCheck {
  name: string;
  installed: boolean;
  version?: string;
  required: string;
}

export class StartupRecovery {
  private configPath: string;
  private packageJsonPath: string;

  constructor(private options: RecoveryOptions = {}) {
    this.configPath = path.join(process.cwd(), 'config.json');
    this.packageJsonPath = path.join(process.cwd(), 'package.json');
  }

  async runRecovery(): Promise<boolean> {
    console.log('🔧 Starting recovery process...');

    try {
      await this.checkAndFixConfiguration();
      await this.checkAndInstallDependencies();
      await this.validateEnvironment();

      console.log('✅ Recovery completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Recovery failed:', error);
      return false;
    }
  }

  private async checkAndFixConfiguration(): Promise<void> {
    console.log('📋 Checking configuration...');

    if (!fs.existsSync(this.configPath)) {
      if (this.options.createDefaults) {
        await this.createDefaultConfig();
        console.log('✅ Created default configuration');
      } else {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }
    }

    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as CashClawConfig;
      await this.validateConfig(config);
    } catch (error) {
      if (this.options.createDefaults) {
        console.log('⚠️ Invalid config detected, creating backup and regenerating...');
        fs.renameSync(this.configPath, `${this.configPath}.backup`);
        await this.createDefaultConfig();
      } else {
        throw new Error(`Invalid configuration: ${error}`);
      }
    }
  }

  private async createDefaultConfig(): Promise<void> {
    const defaultConfig: CashClawConfig = {
      moltlaunch: {
        apiUrl: 'https://api.moltlaunch.com',
        apiKey: process.env.MOLTLAUNCH_API_KEY || '',
        refreshInterval: 30000
      },
      solana: {
        rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
        privateKey: process.env.SOLANA_PRIVATE_KEY || '',
        confirmTimeout: 30000
      },
      llm: {
        provider: 'openai',
        model: 'gpt-4',
        apiKey: process.env.OPENAI_API_KEY || '',
        maxTokens: 2000,
        temperature: 0.7
      },
      agent: {
        maxConcurrentTasks: 3,
        taskTimeout: 300000,
        retryAttempts: 2,
        bidStrategy: 'conservative'
      }
    };

    fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
  }

  private async validateConfig(config: CashClawConfig): Promise<void> {
    const requiredFields = [
      'moltlaunch.apiUrl',
      'solana.rpcUrl',
      'llm.provider',
      'agent.maxConcurrentTasks'
    ];

    for (const field of requiredFields) {
      const value = this.getNestedProperty(config, field);
      if (value === undefined || value === null) {
        throw new Error(`Missing required configuration field: ${field}`);
      }
    }
  }

  private getNestedProperty(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private async checkAndInstallDependencies(): Promise<void> {
    console.log('📦 Checking dependencies...');

    const packageJson = JSON.parse(fs.readFileSync(this.packageJsonPath, 'utf8'));
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    const checks: DependencyCheck[] = [];

    for (const [name, version] of Object.entries(dependencies)) {
      try {
        const installedVersion = execSync(`npm list ${name} --depth=0`, {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        checks.push({
          name,
          installed: true,
          version: this.extractVersionFromNpmList(installedVersion),
          required: version as string
        });
      } catch {
        checks.push({
          name,
          installed: false,
          required: version as string
        });
      }
    }

    const missing = checks.filter(dep => !dep.installed);

    if (missing.length > 0) {
      console.log(`⚠️ Missing dependencies: ${missing.map(d => d.name).join(', ')}`);

      if (this.options.autoInstall) {
        await this.installDependencies();
      } else {
        console.log('Run: npm install');
        throw new Error('Dependencies not installed');
      }
    } else {
      console.log('✅ All dependencies installed');
    }
  }

  private extractVersionFromNpmList(output: string): string {
    const match = output.match(/@(\d+\.\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  }

  private async installDependencies(): Promise<void> {
    console.log('🔄 Installing dependencies...');

    return new Promise((resolve, reject) => {
      const install = spawn('npm', ['install'], {
        stdio: this.options.verbose ? 'inherit' : 'pipe',
        cwd: process.cwd()
      });

      install.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Dependencies installed');
          resolve();
        } else {
          reject(new Error(`npm install failed with code ${code}`));
        }
      });

      install.on('error', reject);
    });
  }

  private async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating environment...');

    const requiredEnvVars = [
      'MOLTLAUNCH_API_KEY',
      'SOLANA_PRIVATE_KEY',
      'OPENAI_API_KEY'
    ];

    const missing = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missing.length > 0) {
      console.log('⚠️ Missing environment variables:');
      missing.forEach(varName => {
        console.log(`  - ${varName}`);
      });

      const envExample = this.generateEnvExample();
      console.log('\nCreate a .env file with:');
      console.log(envExample);

      throw new Error('Missing required environment variables');
    }

    console.log('✅ Environment validation passed');
  }

  private generateEnvExample(): string {
    return `
MOLTLAUNCH_API_KEY=your_moltlaunch_api_key_here
SOLANA_PRIVATE_KEY=your_solana_private_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
OPENAI_API_KEY=your_openai_api_key_here
`.trim();
  }

  async initializeFallbackMode(): Promise<void> {
    console.log('🚨 Initializing fallback mode...');

    const fallbackConfig = {
      mode: 'safe',
      features: {
        taskExecution: false,
        autoQuoting: false,
        walletOperations: false
      },
      monitoring: {
        enabled: true,
        readOnly: true
      }
    };

    const fallbackPath = path.join(process.cwd(), 'fallback.json');
    fs.writeFileSync(fallbackPath, JSON.stringify(fallbackConfig, null, 2));

    console.log('⚠️ Running in fallback mode - limited functionality');
    console.log('Fix configuration and restart for full functionality');
  }
}

export async function runStartupRecovery(options?: RecoveryOptions): Promise<boolean> {
  const recovery = new StartupRecovery(options);
  return recovery.runRecovery();
}

export async function quickFix(): Promise<void> {
  console.log('🔧 Running quick fix...');

  const recovery = new StartupRecovery({
    autoInstall: true,
    createDefaults: true,
    verbose: false
  });

  const success = await recovery.runRecovery();

  if (!success) {
    await recovery.initializeFallbackMode();
  }
}
