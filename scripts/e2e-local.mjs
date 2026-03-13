#!/usr/bin/env node
/**
 * Local E2E pipeline — cross-platform (Windows/macOS/Linux).
 *
 * Steps: docker up → migrate → seed → build → playwright test
 *
 * Usage:
 *   node scripts/e2e-local.mjs             # full pipeline
 *   node scripts/e2e-local.mjs --skip-db   # skip docker (DB already running)
 *   node scripts/e2e-local.mjs --headed    # run Playwright in headed mode
 */
import { execSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const SKIP_DB = args.includes('--skip-db');
const HEADED = args.includes('--headed');

// ── Load .env.e2e if present ──
const envFile = join(ROOT, '.env.e2e');
const envVars = {};
if (existsSync(envFile)) {
    const lines = readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
            envVars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
        }
    }
}

const TEST_DB_URL = envVars.DATABASE_URL_TEST
    || process.env.DATABASE_URL_TEST
    || 'postgresql://test:test@localhost:5434/inflect_test?schema=public';

const env = {
    ...process.env,
    ...envVars,
    DATABASE_URL: TEST_DB_URL,
    DATABASE_URL_TEST: TEST_DB_URL,
    AUTH_TEST_MODE: '1',
    SKIP_ENV_VALIDATION: '1',
    NODE_ENV: 'test',
};

const uploadDir = env.FILE_STORAGE_ROOT || env.UPLOAD_DIR || join(ROOT, 'tmp', 'test-uploads');
mkdirSync(uploadDir, { recursive: true });

function run(cmd, label, extraEnv = {}) {
    const stepEnv = { ...env, ...extraEnv };
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${label}`);
    console.log(`${'═'.repeat(60)}`);
    console.log(`  → ${cmd}\n`);
    try {
        execSync(cmd, { cwd: ROOT, env: stepEnv, stdio: 'inherit', timeout: 600_000 });
    } catch (err) {
        console.error(`\n❌ FAILED: ${label}`);
        process.exit(1);
    }
}

const startTime = Date.now();
console.log('\n🎭 Local E2E Pipeline\n');

// ── 1. Start test DB ──
if (!SKIP_DB) {
    run('docker compose -f docker-compose.test.yml up -d --wait', '1/6  Start test database');
} else {
    console.log('\n⏭  Skipping DB start (--skip-db)\n');
}

// ── 2. Generate + Migrate + Seed ──
run('npx prisma generate', '2/6  Generate Prisma client');
run('npx prisma migrate reset --force --skip-seed', '3/6a Reset test database');
run('npx tsx prisma/seed.ts', '3/6b Seed test data');

// ── 4. Build ──
run('npx next build', '4/6  Build Next.js (production)', { NODE_ENV: 'production' });

// ── 5. Install Playwright browsers ──
run('npx playwright install chromium', '5/6  Install Playwright browsers');

// ── 6. Run E2E tests ──
const pwArgs = HEADED ? '--headed' : '';
run(`npx playwright test ${pwArgs}`.trim(), '6/6  Run Playwright E2E tests');

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n${'═'.repeat(60)}`);
console.log(`  ✅ Local E2E passed in ${elapsed}s`);
console.log(`${'═'.repeat(60)}`);
console.log(`\n📊 Report: npx playwright show-report\n`);
