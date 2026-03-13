/**
 * Enhanced test database helpers.
 *
 * Extends the existing db-helper.ts with:
 * - migrateTestDb(): run prisma migrate deploy against test DB
 * - resetDatabase(): truncate all tables for clean state
 * - prismaTestClient(): get a connected PrismaClient for tests
 * - getTestDatabaseUrl(): resolve the test database URL
 *
 * Usage (integration tests):
 *   import { DB_AVAILABLE } from './db-helper';
 *   import { prismaTestClient, resetDatabase } from '../helpers/db';
 *   if (!DB_AVAILABLE) { test.skip('DB not available', () => {}); return; }
 *   const prisma = prismaTestClient();
 *   afterAll(() => prisma.$disconnect());
 *   beforeEach(() => resetDatabase(prisma));
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';

/**
 * Get the test database URL.
 * Priority: DATABASE_URL_TEST env var > DATABASE_URL from .env > fallback.
 */
export function getTestDatabaseUrl(): string {
    if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;

    // Parse from .env
    const envPath = path.resolve(__dirname, '../../.env');
    try {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^DATABASE_URL="(.*)"/m);
        if (match?.[1]) return match[1];
    } catch { /* no .env */ }

    return 'postgresql://user:password@localhost:5432/testdb';
}

/**
 * Run prisma migrate deploy against the test database.
 * Should be called in globalSetup or once before all integration tests.
 */
export function migrateTestDb(): void {
    const url = getTestDatabaseUrl();
    try {
        execSync('npx prisma migrate deploy', {
            cwd: path.resolve(__dirname, '../..'),
            env: { ...process.env, DATABASE_URL: url },
            stdio: 'pipe',
            timeout: 60_000,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[test-db] Migration failed (DB may not be running): ${msg.slice(0, 200)}`);
    }
}

/**
 * Create and return a PrismaClient connected to the test database.
 */
let _client: PrismaClient | null = null;

export function prismaTestClient(): PrismaClient {
    if (!_client) {
        const url = getTestDatabaseUrl();
        _client = new PrismaClient({ datasources: { db: { url } } });
    }
    return _client;
}

/**
 * Truncate all application tables in the test database.
 * Preserves system tables (_prisma_migrations, etc).
 * Uses TRUNCATE CASCADE for PostgreSQL.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
    const tables = [
        'AuditLog', 'TaskLink', 'TaskComment', 'TaskWatcher', 'Task',
        'EvidenceReview', 'Evidence', 'FileRecord',
        'ControlRequirementLink', 'ControlRiskLink', 'ControlAssetLink',
        'Control', 'Risk', 'Asset',
        'AuditPackItem', 'AuditPack', 'AuditCycle',
        'PolicyVersion', 'Policy',
        'TestRunEvidence', 'TestRun', 'TestPlan',
        'VendorDocument', 'VendorAssessment', 'VendorContact', 'Vendor',
        'Membership', 'Framework', 'FrameworkRequirement',
    ];

    // Use raw SQL for speed — TRUNCATE CASCADE handles FK constraints
    for (const table of tables) {
        try {
            await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
        } catch {
            // Table may not exist in schema — skip silently
        }
    }
}

/**
 * Disconnect the singleton test client.
 */
export async function disconnectTestClient(): Promise<void> {
    if (_client) {
        await _client.$disconnect();
        _client = null;
    }
}
