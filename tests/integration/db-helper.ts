/**
 * Integration test helper: synchronous DB availability check.
 * Used to conditionally skip integration test suites that require PostgreSQL.
 *
 * URL resolution order:
 *   1. DATABASE_URL_TEST env var (set by ci-local.mjs)
 *   2. .env.test file (DATABASE_URL_TEST or DATABASE_URL)
 *   3. .env file DATABASE_URL (dev database)
 *   4. Process env DATABASE_URL
 *   5. Hard-coded fallback
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/**
 * Parse a key from an env file. Returns undefined if not found.
 */
function parseEnvKey(filePath: string, key: string): string | undefined {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const re = new RegExp(`^${key}=["']?([^"'\\n]*)["']?$`, 'm');
        return content.match(re)?.[1] || undefined;
    } catch {
        return undefined;
    }
}

/**
 * Resolve the database URL for integration tests.
 */
function resolveDbUrl(): string {
    // 1. Explicit test env var (highest priority — set by CI scripts)
    if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;

    // 2. .env.test file
    const envTestPath = path.join(ROOT, '.env.test');
    const fromEnvTest = parseEnvKey(envTestPath, 'DATABASE_URL_TEST')
        || parseEnvKey(envTestPath, 'DATABASE_URL');
    if (fromEnvTest) return fromEnvTest;

    // 3. .env file (dev database — standard local dev)
    const envPath = path.join(ROOT, '.env');
    const fromEnv = parseEnvKey(envPath, 'DATABASE_URL');
    if (fromEnv) return fromEnv;

    // 4. Process env (CI environments set DATABASE_URL directly)
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

    // 5. Hard-coded fallback
    return 'postgresql://user:password@localhost:5432/testdb';
}

/**
 * Synchronous DB availability check.
 *
 * Attempts a Prisma `$connect()` + `$queryRaw` against the given URL.
 * Runs synchronously via execSync so it can gate `describe` / `describe.skip`
 * at module scope.
 */
function checkDbAvailable(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const { execSync } = require('child_process');
        execSync(
            `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:'${url.replace(/'/g, "\\\\'")}'}}});p.$connect().then(()=>p.$queryRaw\`SELECT 1\`).then(()=>{p.$disconnect();process.exit(0)}).catch(()=>{p.$disconnect().catch(()=>{});process.exit(1)})"`,
            { timeout: 5000, stdio: 'ignore', cwd: ROOT },
        );
        return true;
    } catch {
        return false;
    }
}

const dbUrl = resolveDbUrl();

export const DB_URL = dbUrl;
export const DB_AVAILABLE = checkDbAvailable(dbUrl);
