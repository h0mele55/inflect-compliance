/**
 * Schema-Code Alignment Guard — Digest Notification Types
 *
 * Ensures that:
 * 1. The Prisma-generated EmailNotificationType enum includes all digest values
 * 2. The digest-dispatcher's DigestCategory type stays in sync with the schema
 * 3. The migration file for digest enum values exists
 * 4. Schema enum and code enum are not drifted
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { readPrismaSchema } from '../helpers/prisma-schema';

// ═════════════════════════════════════════════════════════════════════
// 1. Prisma schema contains digest enum values
// ═════════════════════════════════════════════════════════════════════

describe('Schema: EmailNotificationType includes digest values', () => {
    const REQUIRED_DIGEST_VALUES = [
        'DEADLINE_DIGEST',
        'EVIDENCE_EXPIRY_DIGEST',
        'VENDOR_RENEWAL_DIGEST',
    ];

    const BASE_VALUES = [
        'TASK_ASSIGNED',
        'EVIDENCE_EXPIRING',
        'POLICY_APPROVAL_REQUESTED',
        'POLICY_APPROVED',
        'POLICY_REJECTED',
    ];

    test('prisma schema defines all digest enum values', () => {
        const schema = readPrismaSchema();
        // Extract the EmailNotificationType enum block
        const enumMatch = schema.match(
            /enum\s+EmailNotificationType\s*\{([^}]+)\}/,
        );
        expect(enumMatch).not.toBeNull();
        const enumBody = enumMatch![1];

        for (const value of REQUIRED_DIGEST_VALUES) {
            expect(enumBody).toContain(value);
        }
    });

    test('prisma schema preserves all base enum values', () => {
        const schema = readPrismaSchema();
        const enumMatch = schema.match(
            /enum\s+EmailNotificationType\s*\{([^}]+)\}/,
        );
        const enumBody = enumMatch![1];

        for (const value of BASE_VALUES) {
            expect(enumBody).toContain(value);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
// 2. Migration file exists for digest enum values
// ═════════════════════════════════════════════════════════════════════

describe('Migration: digest enum migration exists and is correct', () => {
    const MIGRATION_DIR = resolve(
        __dirname,
        '../../prisma/migrations/20260417115500_add_digest_notification_types',
    );

    test('migration directory exists', () => {
        expect(existsSync(MIGRATION_DIR)).toBe(true);
    });

    test('migration SQL file exists', () => {
        const sqlPath = resolve(MIGRATION_DIR, 'migration.sql');
        expect(existsSync(sqlPath)).toBe(true);
    });

    test('migration SQL adds all three digest values', () => {
        const sql = readFileSync(
            resolve(MIGRATION_DIR, 'migration.sql'),
            'utf8',
        );

        expect(sql).toContain('DEADLINE_DIGEST');
        expect(sql).toContain('EVIDENCE_EXPIRY_DIGEST');
        expect(sql).toContain('VENDOR_RENEWAL_DIGEST');
    });

    test('migration SQL uses IF NOT EXISTS for idempotency', () => {
        const sql = readFileSync(
            resolve(MIGRATION_DIR, 'migration.sql'),
            'utf8',
        );

        // Each ADD VALUE should use IF NOT EXISTS
        const addStatements = sql.match(/ADD VALUE/g) || [];
        const ifNotExistsStatements = sql.match(/IF NOT EXISTS/g) || [];
        expect(addStatements.length).toBe(3);
        expect(ifNotExistsStatements.length).toBe(3);
    });

    test('migration targets the correct enum type', () => {
        const sql = readFileSync(
            resolve(MIGRATION_DIR, 'migration.sql'),
            'utf8',
        );

        expect(sql).toContain('"EmailNotificationType"');
    });
});

// ═════════════════════════════════════════════════════════════════════
// 3. Code-schema alignment — DigestCategory matches schema enum
// ═════════════════════════════════════════════════════════════════════

describe('Code-schema alignment: digest categories match schema', () => {
    test('digest-dispatcher DigestCategory values are all in schema enum', () => {
        const schema = readPrismaSchema();
        const dispatcherSource = readFileSync(
            resolve(__dirname, '../../src/app-layer/notifications/digest-dispatcher.ts'),
            'utf8',
        );

        // Extract DigestCategory type values from code
        const categoryMatch = dispatcherSource.match(
            /type\s+DigestCategory\s*=\s*([^;]+);/,
        );
        expect(categoryMatch).not.toBeNull();

        const codeValues = (categoryMatch![1].match(/'([^']+)'/g) || [])
            .map(v => v.replace(/'/g, ''));

        // Extract EmailNotificationType enum values from schema
        const enumMatch = schema.match(
            /enum\s+EmailNotificationType\s*\{([^}]+)\}/,
        );
        const schemaValues = enumMatch![1]
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('//'));

        for (const codeValue of codeValues) {
            expect(schemaValues).toContain(codeValue);
        }
    });

    test('notification-dispatch job uses only valid DigestCategory values', () => {
        const source = readFileSync(
            resolve(__dirname, '../../src/app-layer/jobs/notification-dispatch.ts'),
            'utf8',
        );

        // All category string literals used in the dispatch job
        const usedCategories = (source.match(/'(DEADLINE_DIGEST|EVIDENCE_EXPIRY_DIGEST|VENDOR_RENEWAL_DIGEST)'/g) || [])
            .map(v => v.replace(/'/g, ''));

        const schema = readPrismaSchema();
        const enumMatch = schema.match(
            /enum\s+EmailNotificationType\s*\{([^}]+)\}/,
        );
        const schemaValues = enumMatch![1]
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('//'));

        for (const cat of usedCategories) {
            expect(schemaValues).toContain(cat);
        }
    });
});

// ═════════════════════════════════════════════════════════════════════
// 4. Guard: no code uses digest enum values missing from migrations
// ═════════════════════════════════════════════════════════════════════

describe('Guard: every EmailNotificationType value has a migration', () => {
    test('all schema enum values appear in at least one migration', () => {
        const schema = readPrismaSchema();
        const enumMatch = schema.match(
            /enum\s+EmailNotificationType\s*\{([^}]+)\}/,
        );
        const schemaValues = enumMatch![1]
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !l.startsWith('//'));

        // Read all migration SQL files
        const migrationsDir = resolve(__dirname, '../../prisma/migrations');
        const fs = require('fs');
        const migrationDirs = fs.readdirSync(migrationsDir).filter((d: string) =>
            fs.statSync(resolve(migrationsDir, d)).isDirectory(),
        );

        let allMigrationSql = '';
        for (const dir of migrationDirs) {
            const sqlPath = resolve(migrationsDir, dir, 'migration.sql');
            if (fs.existsSync(sqlPath)) {
                allMigrationSql += fs.readFileSync(sqlPath, 'utf8') + '\n';
            }
        }

        const unmigrated: string[] = [];
        for (const value of schemaValues) {
            if (!allMigrationSql.includes(value)) {
                unmigrated.push(value);
            }
        }

        expect(unmigrated).toEqual([]);
    });
});
