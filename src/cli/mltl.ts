#!/usr/bin/env node

import { main } from './index.js';

main().catch((error) => {
  console.error('Error running mltl:', error);
  process.exit(1);
});
