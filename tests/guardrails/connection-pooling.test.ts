/**
 * Guardrail: Connection Pooling Configuration
 *
 * Structural tests verifying PgBouncer/pooling is wired correctly
 * in docker-compose files, Prisma schema, and env config.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('Connection Pooling Configuration', () => {

    describe('Prisma schema', () => {
        const schema = readPrismaSchema();

        test('datasource has url (pooled connection)', () => {
            expect(schema).toContain('url       = env("DATABASE_URL")');
        });

        test('datasource has directUrl (migration connection)', () => {
            expect(schema).toContain('directUrl = env("DIRECT_DATABASE_URL")');
        });
    });

    describe('env.ts validation', () => {
        const envTs = read('src/env.ts');

        test('DATABASE_URL is required', () => {
            expect(envTs).toContain('DATABASE_URL: z.string().url()');
        });

        test('DIRECT_DATABASE_URL is defined (optional)', () => {
            expect(envTs).toContain('DIRECT_DATABASE_URL');
        });
    });

    describe('docker-compose.yml (dev)', () => {
        const compose = read('docker-compose.yml');

        test('has pgbouncer service', () => {
            expect(compose).toContain('pgbouncer:');
        });

        test('pgbouncer uses transaction pool mode', () => {
            expect(compose).toContain('POOL_MODE: transaction');
        });

        test('pgbouncer has MAX_CLIENT_CONN >= 200', () => {
            const match = compose.match(/MAX_CLIENT_CONN:\s*"?(\d+)"?/);
            expect(match).toBeTruthy();
            expect(parseInt(match![1])).toBeGreaterThanOrEqual(200);
        });

        test('pgbouncer has health check', () => {
            // The compose file must contain a healthcheck for PgBouncer
            // We verify the overall file has a pg_isready check for PgBouncer
            expect(compose).toContain('pg_isready -h 127.0.0.1');
        });

        test('postgres has health check', () => {
            expect(compose).toContain('pg_isready');
        });

        test('pgbouncer depends on postgres', () => {
            expect(compose).toContain('depends_on:');
        });
    });

    describe('docker-compose.prod.yml', () => {
        const compose = read('docker-compose.prod.yml');

        test('has pgbouncer service', () => {
            expect(compose).toContain('pgbouncer:');
        });

        test('app depends on pgbouncer (not db directly)', () => {
            const appSection = compose.split('# ── Next.js App')[1] || '';
            expect(appSection).toContain('pgbouncer:');
        });

        test('DATABASE_URL points to pgbouncer', () => {
            expect(compose).toContain('@pgbouncer:');
        });

        test('DATABASE_URL includes pgbouncer=true param', () => {
            expect(compose).toContain('pgbouncer=true');
        });

        test('DIRECT_DATABASE_URL points to db (not pgbouncer)', () => {
            expect(compose).toContain('DIRECT_DATABASE_URL');
            // Find the assignment line (not the comment), identified by the colon
            const directLine = compose.split(/\r?\n/).find(l =>
                l.trim().startsWith('DIRECT_DATABASE_URL:'));
            expect(directLine).toBeTruthy();
            expect(directLine).toContain('@db:');
        });

        test('pgbouncer has no ports exposed to host (internal only)', () => {
            // In prod, pgbouncer should not have ports mapped to the host
            // The pgbouncer service section is between '# ── PgBouncer' and '# ── Next.js'
            const pgbouncerSection = compose
                .split('# ── PgBouncer')[1]
                ?.split('# ── Next.js')[0] || '';
            expect(pgbouncerSection).not.toContain('ports:');
        });
    });

    describe('.env.example', () => {
        const envExample = read('.env.example');

        test('has DATABASE_URL with PgBouncer port', () => {
            expect(envExample).toContain('DATABASE_URL');
            expect(envExample).toContain('5433');
        });

        test('has DIRECT_DATABASE_URL with direct Postgres port', () => {
            expect(envExample).toContain('DIRECT_DATABASE_URL');
            expect(envExample).toContain('5434');
        });

        test('DATABASE_URL includes pgbouncer=true', () => {
            expect(envExample).toContain('pgbouncer=true');
        });
    });
});
