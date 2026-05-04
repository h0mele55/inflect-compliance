/**
 * Prisma 7 config — replaces inline `url`/`directUrl` on the
 * `datasource db {}` block, which Prisma 7 rejects.
 *
 * The CLI (prisma migrate / generate / studio) resolves connection
 * URLs from this file. The runtime client (src/lib/prisma.ts) uses
 * the adapter pattern (`@prisma/adapter-pg`) and reads URLs from
 * the same env vars directly.
 *
 * Two URLs:
 *   • DATABASE_URL — PgBouncer pooler (transaction-mode) used by
 *     the runtime app + most CLI commands.
 *   • DIRECT_DATABASE_URL — direct Postgres connection used by
 *     `prisma migrate` (which needs DDL/lock semantics PgBouncer
 *     doesn't provide).
 */
import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: path.join('prisma', 'schema'),
    migrations: {
        path: path.join('prisma', 'migrations'),
    },
    datasource: {
        // CLI tooling uses the direct URL when present (migrate /
        // generate need DDL semantics PgBouncer doesn't provide); the
        // runtime adapter in `src/lib/prisma.ts` reads `DATABASE_URL`
        // separately.
        url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
    },
});
