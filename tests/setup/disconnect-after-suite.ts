/**
 * Global `afterAll` hook — release long-lived Prisma connections at
 * the end of every test file.
 *
 * Two singletons need to come down:
 *   1. `prismaTestClient()` from `tests/helpers/db.ts` — the
 *      integration-test client.
 *   2. `prisma` from `src/lib/prisma.ts` — the app-layer singleton.
 *      Any test that imports a usecase / repository reaches through
 *      to this client, which holds a Postgres pool open until
 *      explicitly disconnected.
 *
 * Without both, Jest workers exit via `forceExit: true` with the
 * "A worker process has failed to exit gracefully" warning.
 *
 * Registered via the node project's `setupFilesAfterEnv` so it runs
 * exactly once per test file. Both calls are no-ops when the
 * underlying client was never materialised (pure-mock tests).
 */

import { disconnectTestClient } from '../helpers/db';

afterAll(async () => {
    await disconnectTestClient();
    // Reach for app-layer singletons only if they're already loaded —
    // don't force a fresh import and thereby create a new connection
    // just to close it. Pure-mock tests shouldn't touch either.
    type Singletons = typeof globalThis & {
        prisma?: { $disconnect?: () => Promise<void> };
        __bullmq_queue?: { close?: () => Promise<void> };
    };
    const g = globalThis as Singletons;
    if (g.prisma && typeof g.prisma.$disconnect === 'function') {
        try {
            await g.prisma.$disconnect();
        } catch {
            // Best effort — a leaked mid-query disconnect should not
            // surface as a suite failure.
        }
    }
    if (g.__bullmq_queue?.close) {
        try {
            await g.__bullmq_queue.close();
        } catch {
            /* best effort */
        }
    }
});
