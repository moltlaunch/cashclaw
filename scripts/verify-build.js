#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const requiredArtifacts = [
  'dist/cli/index.js',
  'dist/ui/index.html',
  'dist/ui/assets',
  'dist/agent/index.js',
  'package.json'
];

const requiredUIAssets = [
  'dist/ui/assets/index.js',
  'dist/ui/assets/index.css'
];

function checkPath(artifactPath) {
  const fullPath = path.resolve(artifactPath);

  if (!fs.existsSync(fullPath)) {
    return { exists: false, path: artifactPath };
  }

  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    const files = fs.readdirSync(fullPath);
    return { exists: true, path: artifactPath, isDir: true, fileCount: files.length };
  }

  return { exists: true, path: artifactPath, size: stats.size };
}

function verifyUIAssets() {
  const assetsDir = 'dist/ui/assets';
  if (!fs.existsSync(assetsDir)) {
    return { valid: false, reason: 'Assets directory missing' };
  }

  const files = fs.readdirSync(assetsDir);
  const jsFiles = files.filter(f => f.startsWith('index') && f.endsWith('.js'));
  const cssFiles = files.filter(f => f.startsWith('index') && f.endsWith('.css'));

  if (jsFiles.length === 0) {
    return { valid: false, reason: 'No JavaScript bundle found' };
  }

  if (cssFiles.length === 0) {
    return { valid: false, reason: 'No CSS bundle found' };
  }

  // Check if main JS bundle is not empty
  const mainJS = path.join(assetsDir, jsFiles[0]);
  const jsStats = fs.statSync(mainJS);
  if (jsStats.size < 1000) {
    return { valid: false, reason: `JavaScript bundle too small: ${jsStats.size} bytes` };
  }

  return { valid: true, jsFiles, cssFiles };
}

function main() {
  console.log('🔍 Verifying build artifacts...\n');

  let allGood = true;
  const results = [];

  // Check required artifacts
  for (const artifact of requiredArtifacts) {
    const result = checkPath(artifact);
    results.push(result);

    if (result.exists) {
      const sizeInfo = result.isDir ? `(${result.fileCount} files)` : `(${result.size} bytes)`;
      console.log(`✅ ${artifact} ${sizeInfo}`);
    } else {
      console.log(`❌ ${artifact} - MISSING`);
      allGood = false;
    }
  }

  // Special verification for UI assets
  console.log('\n🎨 Checking UI bundle integrity...');
  const uiCheck = verifyUIAssets();

  if (uiCheck.valid) {
    console.log(`✅ UI assets valid`);
    console.log(`   JS bundles: ${uiCheck.jsFiles.join(', ')}`);
    console.log(`   CSS bundles: ${uiCheck.cssFiles.join(', ')}`);
  } else {
    console.log(`❌ UI assets invalid: ${uiCheck.reason}`);
    allGood = false;
  }

  // Verify package.json has correct files field
  console.log('\n📦 Checking package.json...');
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    if (!pkg.files || !pkg.files.includes('dist/')) {
      console.log('⚠️  package.json should include "dist/" in files field');
      allGood = false;
    } else {
      console.log('✅ package.json files field includes dist/');
    }

    if (!pkg.bin || !pkg.bin['cashclaw-agent']) {
      console.log('⚠️  package.json missing CLI bin entry');
      allGood = false;
    } else {
      console.log('✅ package.json has CLI bin entry');
    }
  } catch (err) {
    console.log(`❌ Error reading package.json: ${err.message}`);
    allGood = false;
  }

  console.log('\n' + '='.repeat(50));

  if (allGood) {
    console.log('🎉 All build artifacts verified! Ready for publishing.');
    process.exit(0);
  } else {
    console.log('💥 Build verification FAILED! Do not publish.');
    console.log('\nTo fix, run: npm run build:all');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
