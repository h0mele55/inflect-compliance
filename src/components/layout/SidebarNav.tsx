'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTenantContext, useTenantHref, usePermissions } from '@/lib/tenant-context-provider';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import {
    X,
    LayoutDashboard,
    Building2,
    AlertTriangle,
    ShieldCheck,
    Paperclip,
    FileText,
    ClipboardList,
    FlaskConical,
    Truck,
    Map,
    BarChart3,
    Settings,
    LogOut,
    Bell,
    type LucideIcon,
} from 'lucide-react';

// ─── Types ───

interface NavItemDef {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: string | number;
    /** If set, item is only shown when this returns true */
    visible?: boolean;
}

interface NavSectionDef {
    title?: string;
    items: NavItemDef[];
}

// ─── Navigation configuration ───

export function useNavSections(): NavSectionDef[] {
    const t = useTranslations('nav');
    const tenantHref = useTenantHref();
    const perms = usePermissions();

    return [
        {
            items: [
                { href: tenantHref('/dashboard'), label: t('dashboard'), icon: LayoutDashboard },
                { href: tenantHref('/assets'), label: t('assets'), icon: Building2 },
                { href: tenantHref('/risks'), label: t('risks'), icon: AlertTriangle },
                { href: tenantHref('/controls'), label: t('controls'), icon: ShieldCheck },
                { href: tenantHref('/evidence'), label: t('evidence'), icon: Paperclip },
                { href: tenantHref('/policies'), label: t('policies'), icon: FileText },
                { href: tenantHref('/tasks'), label: t('tasks'), icon: ClipboardList },
                { href: tenantHref('/tests'), label: 'Tests', icon: FlaskConical },
            ],
        },
        {
            title: 'Management',
            items: [
                { href: tenantHref('/vendors'), label: 'Vendors', icon: Truck },
                { href: tenantHref('/frameworks'), label: 'Frameworks', icon: Map },
                { href: tenantHref('/reports'), label: t('reports'), icon: BarChart3, visible: perms.reports.view },
                { href: tenantHref('/admin'), label: t('admin'), icon: Settings, visible: perms.admin.view },
                { href: tenantHref('/admin/notifications'), label: 'Notifications', icon: Bell, visible: perms.admin.view },
            ].filter(item => {
                // DEFENSE-IN-DEPTH (Layer 2 of 2):
                // Layer 1: Server layout uses noStore() to ensure fresh permissions per request.
                // Layer 2: This client-side filter removes gated items based on the resolved permissions.
                // Fail-closed: if `visible` is explicitly set, only include when strictly `true`.
                if (item.visible === undefined) return true; // no gate — always visible
                return item.visible === true;               // gated — only if permission is true
            }),
        },
    ];
}

// ─── NavItem ───

interface NavItemProps {
    href: string;
    icon: LucideIcon;
    label: string;
    active: boolean;
    badge?: string | number;
    onClick?: () => void;
}

function NavItem({ href, icon: Icon, label, active, badge, onClick }: NavItemProps) {
    const slug = href.split('/').pop() ?? '';

    return (
        <Link
            href={href}
            onClick={onClick}
            className={`nav-link ${active ? 'active' : ''}`}
            data-testid={`nav-${slug}`}
        >
            <Icon className="w-[18px] h-[18px] flex-shrink-0" aria-hidden="true" />
            <span className="nav-link-label">{label}</span>
            {badge != null && (
                <span className="ml-auto badge badge-info text-[10px] tabular-nums">
                    {badge}
                </span>
            )}
        </Link>
    );
}

// ─── NavSection ───

interface NavSectionProps {
    title?: string;
    children: React.ReactNode;
}

function NavSection({ title, children }: NavSectionProps) {
    return (
        <div className="nav-section">
            {title && (
                <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    {title}
                </p>
            )}
            <div className="space-y-0.5">{children}</div>
        </div>
    );
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
    const sections = useNavSections();

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
            <nav className="flex-1 p-2 overflow-y-auto" aria-label="Main navigation">
                {sections.map((section, idx) => (
                    <NavSection key={idx} title={section.title}>
                        {section.items.map((item) => (
                            <NavItem
                                key={item.href}
                                href={item.href}
                                icon={item.icon}
                                label={item.label}
                                badge={item.badge}
                                active={pathname.startsWith(item.href)}
                                onClick={onNavClick}
                            />
                        ))}
                    </NavSection>
                ))}
            </nav>

            {/* User */}
            <div className="p-3 border-t border-slate-700/50">
                <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-300 truncate">{user.name}</p>
                        <p className="text-xs text-slate-500 truncate">{tenant.tenantName}</p>
                        <p className="text-xs text-brand-400">{tenant.role}</p>
                    </div>
                    <ThemeToggle id="theme-toggle-desktop" />
                </div>
                <button
                    onClick={onLogout}
                    className="btn btn-ghost btn-sm w-full text-xs"
                    data-testid="nav-logout"
                >
                    <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
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

    // Close on route change (always close to avoid stale open state)
    useEffect(() => {
        onClose();
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
                data-open={open ? 'true' : 'false'}
            >
                {/* Close button — 44px touch target */}
                <button
                    type="button"
                    className="absolute top-3 right-3 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors"
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
