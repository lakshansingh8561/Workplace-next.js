/* eslint-disable @typescript-eslint/no-require-imports */
// scripts/prisma-generate-safe.js
// Safe wrapper for `prisma generate` that fails with a clear message if generation fails.
// It does NOT retry indefinitely and does not delete any generated files.
// Exit code matches the underlying Prisma CLI exit status or returns nonzero on error.

const { spawnSync } = require('child_process');

function runGenerate() {
  const isWindows = process.platform === 'win32';
  const result = spawnSync('npx', ['prisma', 'generate'], {
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.error) {
    console.error('\n[Prisma] Failed to execute prisma generate:', result.error.message || result.error);
    return typeof result.status === 'number' && result.status !== 0 ? result.status : 1;
  }

  if (typeof result.status === 'number') {
    return result.status;
  }

  if (result.signal) {
    console.error(`\n[Prisma] Prisma generate process terminated by signal: ${result.signal}`);
    return 1;
  }

  return 0;
}

const exitCode = runGenerate();
if (exitCode !== 0) {
  console.error(`\n[Prisma] Generation failed with exit code ${exitCode}. This often occurs when another process (e.g., \`npm run dev\`) holds the query-engine DLL on Windows.`);
  console.error('Make sure no server or background worker is running, then retry `npm install` or run `npx prisma generate` manually.');
  process.exit(exitCode);
}

process.exit(0);
