/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/run_integration_tests.js
/**
 * Integration test runner.
 * Fails closed unless a dedicated test database can be positively identified.
 * Never prints connection strings or credentials.
 */

function verifyDedicatedTestDatabase(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isTestDb: false, reason: 'Database connection URL is missing.' };
  }

  // Reject production environments immediately
  if (process.env.NODE_ENV === 'production') {
    return { isTestDb: false, reason: 'Cannot run integration tests when NODE_ENV is set to "production".' };
  }

  // Reject MongoDB Atlas / SRV / remote cloud clusters
  if (/mongodb\.net/i.test(rawUrl) || /^mongodb\+srv:/i.test(rawUrl)) {
    return {
      isTestDb: false,
      reason: 'Remote MongoDB Atlas connection detected. Integration tests must not run against Atlas.',
    };
  }

  let dbName = '';
  let isLocalHost = false;

  try {
    // Normalise mongodb scheme to http for standard URL parsing without exposing secrets
    const parsed = new URL(rawUrl.replace(/^mongodb:\/\//i, 'http://'));
    const pathname = (parsed.pathname || '').replace(/^\//, '');
    dbName = pathname.toLowerCase();
    const hostname = (parsed.hostname || '').toLowerCase();
    isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    // Fallback: extract dbName pattern if URL parsing throws
    const match = rawUrl.match(/\/([^/?#]+)(?:\?|$)/);
    if (match) {
      dbName = match[1].toLowerCase();
    }
  }

  // Positively identify: Database name MUST contain 'test' (e.g. 'workpulse_test', 'freelance_test')
  if (!dbName || !dbName.includes('test')) {
    return {
      isTestDb: false,
      reason: 'Database name does not identify as a dedicated test database (database name must contain "test").',
    };
  }

  // Positively identify: Must be running against local database
  if (!isLocalHost) {
    return {
      isTestDb: false,
      reason: 'Database host is not a verified local test instance (must be localhost or 127.0.0.1).',
    };
  }

  return { isTestDb: true };
}

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Safely inspect .env for default configuration if not passed via shell env
if (!process.env.TEST_DATABASE_URL && !process.env.DATABASE_URL) {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('TEST_DATABASE_URL=')) {
        process.env.TEST_DATABASE_URL = trimmed.slice('TEST_DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      } else if (trimmed.startsWith('DATABASE_URL=') && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = trimmed.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

const targetDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!targetDbUrl) {
  console.error('[Integration Tests] No database URL configured (neither TEST_DATABASE_URL nor DATABASE_URL is set). Aborting.');
  console.error('[Integration Tests] Set TEST_DATABASE_URL to a dedicated test database (e.g., mongodb://localhost:27017/workpulse_test).');
  process.exit(1);
}

const verification = verifyDedicatedTestDatabase(targetDbUrl);

if (!verification.isTestDb) {
  console.error(`[Integration Tests] Refusing to run: ${verification.reason}`);
  console.error('[Integration Tests] Tests fail closed unless a dedicated local test database (e.g., mongodb://localhost:27017/workpulse_test) is positively identified.');
  console.error('[Integration Tests] Set TEST_DATABASE_URL="mongodb://localhost:27017/workpulse_test" before running integration tests.');
  process.exit(1);
}

console.log('[Integration Tests] Dedicated test database positively identified. Running integration test suite...');

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const child = spawnSync(
  npxCmd,
  ['vitest', 'run', 'src/tests/integration'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: targetDbUrl,
      TEST_DATABASE_URL: targetDbUrl,
      WORKPULSE_INTEGRATION_RUN: 'true',
    },
    shell: true,
  }
);

if (child.error) {
  console.error('[Integration Tests] Failed to execute vitest process:', child.error.message);
  process.exit(1);
}

process.exit(child.status !== null ? child.status : 1);

