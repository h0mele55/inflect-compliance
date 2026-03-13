import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async () => {
    // Disconnect Prisma to prevent open handles from hanging Jest
    await prisma.$disconnect();
};
