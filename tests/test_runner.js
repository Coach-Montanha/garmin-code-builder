#!/usr/bin/env node

/**
 * Garmin Running Tracker - Unified E2E Test Runner
 * Executes Playwright test suites across Tiers 1-4 with lifecycle management and structured reporting.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const ARGS = process.argv.slice(2);

function printHelp() {
  console.log(`
Garmin Running Tracker - Unified Test Runner
============================================
Usage: node tests/test_runner.js [options]

Options:
  --tier=1|2|3|4|all    Run specific test tier (default: all)
  --browser=chrome|edge Browser channel to use (default: chrome)
  --headed              Run in headed browser mode (default: headless)
  --grep=<regex>        Run tests matching pattern
  --list                List all discovered tests without execution
  --help                Display this help screen

Examples:
  node tests/test_runner.js
  node tests/test_runner.js --tier=1
  node tests/test_runner.js --tier=4 --browser=edge
  node tests/test_runner.js --list
`);
}

if (ARGS.includes('--help') || ARGS.includes('-h')) {
  printHelp();
  process.exit(0);
}

// Parse options
const tierArg = ARGS.find((a) => a.startsWith('--tier='));
const selectedTier = tierArg ? tierArg.split('=')[1] : 'all';

const browserArg = ARGS.find((a) => a.startsWith('--browser='));
const selectedBrowser = browserArg ? browserArg.split('=')[1] : 'chrome';

const isHeaded = ARGS.includes('--headed');
const isList = ARGS.includes('--list');
const grepArg = ARGS.find((a) => a.startsWith('--grep='));
const grepPattern = grepArg ? grepArg.split('=')[1] : null;

// Determine target test specs
const tierMap = {
  '1': 'tests/e2e/tier1_feature_coverage.spec.js',
  '2': 'tests/e2e/tier2_boundary_corner.spec.js',
  '3': 'tests/e2e/tier3_cross_feature.spec.js',
  '4': 'tests/e2e/tier4_real_world.spec.js',
};

let targetFiles = [];
if (selectedTier === 'all') {
  targetFiles = Object.values(tierMap);
} else if (tierMap[selectedTier]) {
  targetFiles = [tierMap[selectedTier]];
} else {
  console.error(`[ERROR] Unknown tier: "${selectedTier}". Valid options: 1, 2, 3, 4, all.`);
  process.exit(1);
}

/**
 * Check if local server is listening on port 3000.
 */
function isServerRunning(port = 3000, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const req = http.request({ method: 'GET', host, port, path: '/', timeout: 1500 }, (res) => {
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Main Runner Routine
 */
async function run() {
  console.log('====================================================');
  console.log('  Garmin Running Tracker — E2E Test Suite Runner');
  console.log('====================================================');
  console.log(`Target:    Tier ${selectedTier.toUpperCase()}`);
  console.log(`Browser:   ${selectedBrowser.toUpperCase()} (system channel)`);
  console.log(`Mode:      ${isHeaded ? 'HEADED' : 'HEADLESS'}`);
  console.log(`Suites:    ${targetFiles.join(', ')}`);
  console.log('----------------------------------------------------');

  const serverOnline = await isServerRunning(3000);
  console.log(`Target WebServer (http://localhost:3000): ${serverOnline ? 'ONLINE' : 'NOT DETECTED (will launch via Playwright webServer if configured)'}`);

  // Build Playwright CLI arguments
  const pwArgs = ['playwright', 'test'];
  pwArgs.push(...targetFiles);
  pwArgs.push(`--project=${selectedBrowser}`);

  if (isHeaded) pwArgs.push('--headed');
  if (isList) pwArgs.push('--list');
  if (grepPattern) pwArgs.push(`--grep=${grepPattern}`);

  const startTime = Date.now();

  const isWindows = process.platform === 'win32';
  const npxCmd = isWindows ? 'npx.cmd' : 'npx';

  const child = spawn(npxCmd, pwArgs, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
    },
    shell: true,
  });

  child.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('----------------------------------------------------');
    console.log(`Test Execution Finished in ${duration}s with exit code: ${code}`);
    console.log('====================================================');
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    console.error('[ERROR] Failed to execute Playwright process:', err.message);
    process.exit(1);
  });
}

run().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
