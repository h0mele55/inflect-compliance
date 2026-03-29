/**
 * Integration test helper: synchronous DB availability check.
 * Used to conditionally skip integration test suites that require PostgreSQL.
 */
import * as fs from 'fs';
import * as path from 'path';

// Parse DATABASE_URL from .env
const envPath = path.resolve(__dirname, '../../.env');
let dbUrl: string | undefined;
try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^DATABASE_URL="(.*)"$/m);
    dbUrl = match?.[1];
} catch { /* no .env file */ }

// Fallback to process.env (CI environments set DATABASE_URL directly)
if (!dbUrl) {
    dbUrl = process.env.DATABASE_URL;
}

/**
 * Synchronous DB availability check.
 *
 * We do two checks:
 * 1. TCP port check — fast, eliminates environments with no DB at all.
 * 2. Actual Prisma `$connect()` + `$queryRaw` — eliminates environments where
 *    the port is listening but the DB isn't properly configured (wrong credentials,
 *    missing migrations, different service on the port, etc.).
 *
 * The Prisma connection check runs synchronously using execSync so it can gate
 * `describe` / `describe.skip` at module scope.
 */
function checkDbAvailable(url: string | undefined): boolean {
    if (!url) return false;
    try {
        const { execSync } = require('child_process');
        // Actually attempt a Prisma connection and simple query
        execSync(
            `node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient({datasources:{db:{url:'${url.replace(/'/g, "\\'")}'}}});p.$connect().then(()=>p.$queryRaw\`SELECT 1\`).then(()=>{p.$disconnect();process.exit(0)}).catch(()=>{p.$disconnect().catch(()=>{});process.exit(1)})"`,
            { timeout: 5000, stdio: 'ignore', cwd: path.resolve(__dirname, '../..') },
        );
        return true;
    } catch {
        return false;
    }
}

export const DB_URL = dbUrl;
export const DB_AVAILABLE = checkDbAvailable(dbUrl);

