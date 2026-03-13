/**
 * Jest globalSetup: runs before all test suites.
 * - Migrates the test database (if available)
 * - Logs test environment info
 */
import { migrateTestDb, getTestDatabaseUrl } from '../helpers/db';

export default async function globalSetup() {
    const url = getTestDatabaseUrl();
    const isTestDb = url.includes('testdb') || url.includes('test');

    console.log(`\n[test-setup] Database URL: ${url.replace(/:[^@]*@/, ':***@')}`);
    console.log(`[test-setup] Running migrations...`);

    try {
        migrateTestDb();
        console.log(`[test-setup] Migrations complete`);
    } catch (err) {
        console.warn(`[test-setup] Migration skipped: ${err}`);
    }

    if (!isTestDb) {
        console.warn(`[test-setup] WARNING: DATABASE_URL does not look like a test database!`);
    }
}
