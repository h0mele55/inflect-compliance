'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/query-client';
import { Menu } from 'lucide-react';
import { SidebarContent, MobileDrawer } from '@/components/layout/SidebarNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { data: session, status } = useSession();
    const tc = useTranslations('common');
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.replace('/login');
        }
    }, [status, router]);

    const handleLogout = useCallback(async () => {
        await signOut({ callbackUrl: '/login' });
    }, []);

    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    if (status === 'loading' || !session) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="animate-pulse text-brand-400">{tc('loading')}</div>
        </div>
    );

    const user = session.user;

    return (
        <div className="min-h-screen flex">
            {/* Desktop sidebar — hidden on mobile, visible on md+ */}
            <aside className="hidden md:flex w-56 bg-slate-900/50 border-r border-slate-700/50 flex-col flex-shrink-0">
                <SidebarContent user={user} onLogout={handleLogout} />
            </aside>

            {/* Mobile drawer — only renders overlay on <md */}
            <MobileDrawer open={drawerOpen} onClose={closeDrawer}>
                <SidebarContent user={user} onLogout={handleLogout} onNavClick={closeDrawer} />
            </MobileDrawer>

            {/* Main content */}
            <main className="flex-1 overflow-auto min-w-0">
                {/* Mobile top bar — visible on <md only */}
                <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-2 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50">
                    <button
                        type="button"
                        className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors"
                        onClick={() => setDrawerOpen(true)}
                        aria-label="Open navigation menu"
                        data-testid="nav-toggle"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
                            <span className="text-white text-[10px] font-bold">IC</span>
                        </div>
                        <span className="text-sm font-semibold text-white">{tc('appName')}</span>
                    </div>
                </div>

                <QueryClientProvider client={getQueryClient()}>
                    <div className="p-4 md:p-6 max-w-7xl mx-auto">
                        {children}
                    </div>
                </QueryClientProvider>
            </main>
        </div>
    );
}
