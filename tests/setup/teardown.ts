// Prisma 7 — `new PrismaClient()` requires an adapter. The teardown
// is purely a "close anything that survived" hook; it does not need
// to issue queries. Skip the local construction and just disconnect
// any singletons the parent process has on `globalThis`.

export default async () => {
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
