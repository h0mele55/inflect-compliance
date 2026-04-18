import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, verifyPassword, signToken } from '@/lib/auth';
import { withValidatedBody } from '@/lib/validation/route';
import { AuthActionSchema } from '@/lib/schemas';
import { env } from '@/env';
import { withApiErrorHandling } from '@/lib/errors/api';
import { logger } from '@/lib/observability/logger';

export const POST = withApiErrorHandling(withValidatedBody(AuthActionSchema, async (req, ctx, body) => {
    try {
        if (body.action === 'register') {
            return await handleRegister(body);
        } else if (body.action === 'login') {
            return await handleLogin(body);
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        logger.error('Auth error', { component: 'auth', error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: error.message || 'Auth failed' }, { status: 500 });
    }
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRegister(body: any) {
    const { email, password, name, orgName } = body;
    if (!email || !password || !name || !orgName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if email already used
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
        return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    // Create tenant
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
    const tenant = await prisma.tenant.create({
        data: { name: orgName, slug },
    });

    // Create user (no role/tenantId — membership is sole authority)
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            name,
        },
    });

    // Create TenantMembership (sole source of role + tenant binding)
    const membership = await prisma.tenantMembership.create({
        data: {
            tenantId: tenant.id,
            userId: user.id,
            role: 'ADMIN',
        },
    });

    const token = signToken({
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
        role: membership.role,
    });

    const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: membership.role },
        tenant: { id: tenant.id, name: tenant.name },
    });

    response.cookies.set('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
    });

    return response;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLogin(body: any) {
    const { email, password } = body;
    if (!email || !password) {
        return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const user = await prisma.user.findFirst({
        where: { email },
        include: {
            tenantMemberships: {
                where: { status: 'ACTIVE' },
                orderBy: { createdAt: 'asc' },
                take: 1,
                include: { tenant: true },
            },
        },
    });

    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Resolve tenant and role from membership (sole authority)
    const membership = user.tenantMemberships[0];

    const token = signToken({
        userId: user.id,
        tenantId: membership?.tenantId ?? '',
        email: user.email,
        role: membership?.role ?? 'READER',
    });

    const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: membership?.role ?? 'READER' },
        tenant: membership?.tenant ? { id: membership.tenant.id, name: membership.tenant.name } : null,
    });

    response.cookies.set('token', token, {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
    });

    return response;
}
