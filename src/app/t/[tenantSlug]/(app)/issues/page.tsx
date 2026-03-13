'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantHref } from '@/lib/tenant-context-provider';

/** Legacy redirect: /issues → /tasks */
export default function IssuesRedirect() {
    const router = useRouter();
    const tenantHref = useTenantHref();
    useEffect(() => { router.replace(tenantHref('/tasks')); }, [router, tenantHref]);
    return <div className="p-12 text-center text-slate-500 animate-pulse">Redirecting to Tasks…</div>;
}
