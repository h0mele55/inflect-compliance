'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { useTenantContext, useTenantHref } from '@/lib/tenant-context-provider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { data: session, status } = useSession();
    const t = useTranslations('nav');
    const tc = useTranslations('common');
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Get tenant info from context (resolved server-side by parent layout)
    const tenant = useTenantContext();
    const tenantHref = useTenantHref();

    const NAV_ITEMS = [
        { href: tenantHref('/dashboard'), label: t('dashboard'), icon: '📊' },
        { href: tenantHref('/assets'), label: t('assets'), icon: '🏢' },
        { href: tenantHref('/risks'), label: t('risks'), icon: '⚠️' },
        { href: tenantHref('/controls'), label: t('controls'), icon: '🛡️' },
        { href: tenantHref('/evidence'), label: t('evidence'), icon: '📎' },
        { href: tenantHref('/policies'), label: t('policies'), icon: '📄' },
        { href: tenantHref('/tasks'), label: t('tasks'), icon: '📋' },
        { href: tenantHref('/tests'), label: 'Tests', icon: '🧪' },
        { href: tenantHref('/vendors'), label: 'Vendors', icon: '🏢' },
        { href: tenantHref('/frameworks'), label: 'Frameworks', icon: '🗺️' },
        { href: tenantHref('/reports'), label: t('reports'), icon: '📈' },
        { href: tenantHref('/admin'), label: t('admin'), icon: '⚙️' },
    ];

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/login');
        }
    }, [status, router]);

    const handleLogout = async () => {
        await signOut({ callbackUrl: '/login' });
    };

    if (status === 'loading' || !session) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-pulse text-brand-400">{tc('loading')}</div>
        </div>
    );

    const user = session.user;

    return (
        <div className="min-h-screen flex">
            {/* Sidebar */}
            <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} transition-all duration-300 bg-slate-900/50 border-r border-slate-700/50 flex flex-col`}>
                {/* Logo */}
                <div className="p-4 border-b border-slate-700/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white text-sm font-bold">IC</span>
                        </div>
                        {sidebarOpen && <span className="text-sm font-semibold text-white truncate">{tc('appName')}</span>}
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                    {NAV_ITEMS.map((item) => (
                        <Link key={item.href} href={item.href}
                            className={`nav-link ${pathname.startsWith(item.href) ? 'active' : ''}`}>
                            <span className="text-base">{item.icon}</span>
                            {sidebarOpen && <span>{item.label}</span>}
                        </Link>
                    ))}
                </nav>

                {/* User */}
                <div className="p-3 border-t border-slate-700/50">
                    {sidebarOpen && (
                        <div className="mb-2">
                            <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
                            <p className="text-xs text-slate-500 truncate">{tenant.tenantName}</p>
                            <p className="text-xs text-brand-400">{tenant.role}</p>
                        </div>
                    )}
                    <button onClick={handleLogout} className="btn btn-ghost btn-sm w-full text-xs">
                        {sidebarOpen ? tc('signOut') : '🚪'}
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 overflow-auto">
                <QueryClientProvider client={getQueryClient()}>
                    <div className="p-6 max-w-7xl mx-auto">
                        {children}
                    </div>
                </QueryClientProvider>
            </main>
        </div>
    );
}
