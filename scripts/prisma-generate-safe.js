// scripts/prisma-generate-safe.js
// Safe wrapper for `prisma generate` that fails with a clear message if a file lock prevents generation.
// It does NOT retry indefinitely and does not delete any generated files.
// Exit code matches the underlying Prisma CLI exit status.

const { spawnSync } = require('child_process');

function runGenerate() {
  const result = spawnSync('npx', ['prisma', 'generate'], { stdio: 'inherit' });
  return result.status;
}

const exitCode = runGenerate();
if (exitCode !== 0) {
  console.error('\n[Prisma] Generation failed. This often occurs when another process (e.g., `npm run dev`) holds the query-engine DLL on Windows.');
  console.error('Make sure no server or background worker is running, then retry `npm install` or run `npx prisma generate` manually.');
  process.exit(exitCode);
}

process.exit(0);
