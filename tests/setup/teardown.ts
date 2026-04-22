import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async () => {
    // Disconnect the teardown-local Prisma instance.
    await prisma.$disconnect();

    // Also close any app-layer singletons that parent-process workers
    // might have materialised. The per-file `afterAll` in
    // `setupFilesAfterEnv` handles worker processes; this handles any
    // state that survived into the main Jest process.
    type Globals = typeof globalThis & {
        prisma?: { $disconnect?: () => Promise<void> };
        __bullmq_queue?: { close?: () => Promise<void> };
    };
    const g = globalThis as Globals;
    if (g.prisma?.$disconnect) {
        await g.prisma.$disconnect().catch(() => {});
    }
    if (g.__bullmq_queue?.close) {
        await g.__bullmq_queue.close().catch(() => {});
    }
};
