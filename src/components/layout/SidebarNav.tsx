'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTenantContext, useTenantHref } from '@/lib/tenant-context-provider';
import { X } from 'lucide-react';

// ─── Navigation configuration ───

export function useNavItems() {
    const t = useTranslations('nav');
    const tenantHref = useTenantHref();

    return [
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
}

// ─── Sidebar content (shared between desktop sidebar and mobile drawer) ───

interface SidebarContentProps {
    user: { name?: string | null };
    onLogout: () => void;
    onNavClick?: () => void;
}

export function SidebarContent({ user, onLogout, onNavClick }: SidebarContentProps) {
    const pathname = usePathname();
    const tc = useTranslations('common');
    const tenant = useTenantContext();
    const navItems = useNavItems();

    return (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-sm font-bold">IC</span>
                    </div>
                    <span className="text-sm font-semibold text-white truncate">{tc('appName')}</span>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavClick}
                        className={`nav-link ${pathname.startsWith(item.href) ? 'active' : ''}`}
                    >
                        <span className="text-base">{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>

            {/* User */}
            <div className="p-3 border-t border-slate-700/50">
                <div className="mb-2">
                    <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{tenant.tenantName}</p>
                    <p className="text-xs text-brand-400">{tenant.role}</p>
                </div>
                <button onClick={onLogout} className="btn btn-ghost btn-sm w-full text-xs">
                    {tc('signOut')}
                </button>
            </div>
        </div>
    );
}

// ─── Mobile Drawer ───

interface MobileDrawerProps {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
    const pathname = usePathname();

    // Close on route change
    useEffect(() => {
        if (open) onClose();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Lock body scroll when open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    return (
        <>
            {/* Backdrop */}
            <div
                className={`
                    fixed inset-0 z-40 bg-black/60 backdrop-blur-sm
                    transition-opacity duration-300
                    ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
                `}
                onClick={onClose}
                aria-hidden="true"
                data-testid="nav-drawer-backdrop"
            />

            {/* Drawer */}
            <div
                className={`
                    fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/95 border-r border-slate-700/50
                    transform transition-transform duration-300 ease-in-out
                    ${open ? 'translate-x-0' : '-translate-x-full'}
                `}
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
                data-testid="nav-drawer"
            >
                {/* Close button */}
                <button
                    type="button"
                    className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
                    onClick={onClose}
                    aria-label="Close navigation"
                    data-testid="nav-drawer-close"
                >
                    <X className="w-5 h-5" />
                </button>

                {children}
            </div>
        </>
    );
}
