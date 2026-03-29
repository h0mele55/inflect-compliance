'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Menu } from 'lucide-react';
import { SidebarContent, MobileDrawer } from '@/components/layout/SidebarNav';

// ─── Types ───

interface AppShellUser {
    name?: string | null;
}

interface AppShellProps {
    /** Serializable user data resolved server-side */
    user: AppShellUser;
    /** Pre-resolved app name (from server-side i18n) */
    appName: string;
    children: React.ReactNode;
}

/**
 * Client-side app shell.
 *
 * Contains all interactive layout UI that cannot live in a Server Component:
 * - Mobile drawer toggle state
 * - Sign-out handler (requires next-auth/react)
 * - Route-change auto-close for mobile drawer
 *
 * Data-layer providers (QueryClientProvider) live in ClientProviders,
 * composed separately by the server layout.
 *
 * Receives only serializable props from the server layout.
 */
export function AppShell({ user, appName, children }: AppShellProps) {
    const [drawerOpen, setDrawerOpen] = useState(false);

    const handleLogout = useCallback(async () => {
        await signOut({ callbackUrl: '/login' });
    }, []);

    const closeDrawer = useCallback(() => setDrawerOpen(false), []);

    // Auto-close drawer on route change
    const pathname = usePathname();
    const prevPathname = useRef(pathname);
    useEffect(() => {
        if (prevPathname.current !== pathname) {
            setDrawerOpen(false);
            prevPathname.current = pathname;
        }
    }, [pathname]);

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
                        <span className="text-sm font-semibold text-white">{appName}</span>
                    </div>
                </div>

                <div className="p-4 md:p-6 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
