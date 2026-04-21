'use client';
import { formatDateTime } from '@/lib/format-date';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { AppIcon } from '@/components/icons/AppIcon';

export default function NotificationsPage() {
    const apiUrl = useTenantApiUrl();
    const t = useTranslations('notifications');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [notifications, setNotifications] = useState<any[]>([]);

    useEffect(() => { fetch(apiUrl('/notifications')).then(r => r.json()).then(setNotifications); }, [apiUrl]);

    const markRead = async (id: string) => {
        await fetch(apiUrl(`/notifications/${id}`), { method: 'PATCH' });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold">{t('title')}</h1>
            <div className="space-y-2">
                {notifications.map(n => (
                    <div key={n.id} className={`glass-card p-4 flex items-start gap-3 ${!n.read ? 'border-l-2 border-brand-500' : 'opacity-60'}`}>
                        <span className="text-lg"><AppIcon name={n.type === 'EVIDENCE' ? 'evidence' : n.type === 'FINDING' ? 'bug' : 'bell'} size={18} /></span>
                        <div className="flex-1">
                            <p className="text-sm text-content-emphasis">{n.message}</p>
                            <p className="text-xs text-content-subtle mt-1">{formatDateTime(n.createdAt)}</p>
                        </div>
                        {!n.read && <button onClick={() => markRead(n.id)} className="btn btn-ghost btn-sm text-xs">{t('markRead')}</button>}
                    </div>
                ))}
                {notifications.length === 0 && <div className="glass-card p-12 text-center text-content-subtle">{t('noNotifications')}</div>}
            </div>
        </div>
    );
}
