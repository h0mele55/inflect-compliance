import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, verifyPassword, signToken } from '@/lib/auth';
import { withValidatedBody } from '@/lib/validation/route';
import { AuthActionSchema } from '@/lib/schemas';
import { env } from '@/env';
import { withApiErrorHandling } from '@/lib/errors/api';

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
        console.error('Auth error:', error);
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

    // Create user (role on User is deprecated but kept for backward compat)
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
        data: {
            tenantId: tenant.id,
            email,
            passwordHash,
            name,
            role: 'ADMIN',
        },
    });

    // Create TenantMembership (authoritative source of role)
    await prisma.tenantMembership.create({
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
        role: user.role,
    });

    const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
        include: { tenant: true },
    });

    if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = signToken({
        userId: user.id,
        tenantId: user.tenantId ?? '',
        email: user.email,
        role: user.role,
    });

    const response = NextResponse.json({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        tenant: user.tenant ? { id: user.tenant.id, name: user.tenant.name } : null,
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
