/**
 * Add test users with different roles to the first tenant.
 * Usage: npx tsx scripts/add-test-user.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) { console.error('No tenant found. Run prisma db seed first.'); return; }

    const users = [
        { email: 'editor@acme.com', name: 'Editor User', role: 'EDITOR' as const },
        { email: 'reader@acme.com', name: 'Reader User', role: 'READER' as const },
        { email: 'auditor@acme.com', name: 'Auditor User', role: 'AUDITOR' as const },
    ];

    const passwordHash = await bcrypt.hash('password123', 10);

    for (const u of users) {
        // Create or find user
        let user = await prisma.user.findUnique({ where: { email: u.email } });
        if (!user) {
            user = await prisma.user.create({
                data: { email: u.email, name: u.name, passwordHash },
            });
        }

        // Create or find membership
        const existing = await prisma.tenantMembership.findUnique({
            where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        });
        if (!existing) {
            await prisma.tenantMembership.create({
                data: { tenantId: tenant.id, userId: user.id, role: u.role },
            });
        }

        console.log(`✅ ${u.email} → ${u.role} in ${tenant.name}`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
