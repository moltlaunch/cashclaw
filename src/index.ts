#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  // Check if we're running as CLI (node script) vs imported as module
  const isMainModule = process.argv[1] === __filename ||
                      process.argv[1]?.endsWith('src/index.ts') ||
                      process.argv[1]?.endsWith('dist/index.js');

  if (isMainModule) {
    // Running as CLI - delegate to CLI handler
    const { runCLI } = await import('./cli/index.js');
    await runCLI();
  }
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export * from './config.js';
export * from './loop/index.js';
export * from './llm/types.js';
export * from './moltlaunch/types.js';
