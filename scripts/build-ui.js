#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🏗️  Building CashClaw UI...');

// Ensure we're in the right directory
const projectRoot = path.resolve(__dirname, '..');
process.chdir(projectRoot);

// Check if package.json exists
if (!fs.existsSync('package.json')) {
  console.error('❌ package.json not found. Are you in the right directory?');
  process.exit(1);
}

try {
  // Clean previous builds
  console.log('🧹 Cleaning previous builds...');
  if (fs.existsSync('dist')) {
    execSync('rm -rf dist', { stdio: 'inherit' });
  }

  // Install dependencies if node_modules doesn't exist
  if (!fs.existsSync('node_modules')) {
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
  }

  // Build the main application
  console.log('🔨 Building main application...');
  execSync('npm run build', { stdio: 'inherit' });

  // Build the UI specifically
  console.log('🎨 Building UI components...');
  if (fs.existsSync('ui')) {
    process.chdir('ui');

    // Install UI dependencies if needed
    if (!fs.existsSync('node_modules')) {
      console.log('📦 Installing UI dependencies...');
      execSync('npm install', { stdio: 'inherit' });
    }

    // Build UI
    execSync('npm run build', { stdio: 'inherit' });

    // Copy built UI to dist/ui
    process.chdir(projectRoot);
    const uiDistPath = path.join('dist', 'ui');

    if (!fs.existsSync('dist')) {
      fs.mkdirSync('dist', { recursive: true });
    }

    if (fs.existsSync('ui/dist')) {
      execSync(`cp -r ui/dist ${uiDistPath}`, { stdio: 'inherit' });
    } else if (fs.existsSync('ui/build')) {
      execSync(`cp -r ui/build ${uiDistPath}`, { stdio: 'inherit' });
    } else {
      console.warn('⚠️  UI build output not found in ui/dist or ui/build');
    }
  } else {
    console.warn('⚠️  UI directory not found, skipping UI build');
  }

  // Verify the build
  console.log('✅ Verifying build outputs...');
  const requiredPaths = ['dist'];
  const missingPaths = requiredPaths.filter(p => !fs.existsSync(p));

  if (missingPaths.length > 0) {
    console.error(`❌ Missing build outputs: ${missingPaths.join(', ')}`);
    process.exit(1);
  }

  // Check if UI assets exist
  const uiPath = path.join('dist', 'ui');
  if (fs.existsSync(uiPath)) {
    const uiFiles = fs.readdirSync(uiPath, { recursive: true });
    const hasAssets = uiFiles.some(file => file.includes('.js') || file.includes('.css'));

    if (hasAssets) {
      console.log('✅ UI build completed successfully!');
    } else {
      console.warn('⚠️  UI directory exists but no assets found');
    }
  } else {
    console.warn('⚠️  No UI build found in dist/ui');
  }

  console.log('🎉 Build process completed!');

} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
