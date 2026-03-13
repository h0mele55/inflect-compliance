'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

export default function NotificationsPage() {
    const apiUrl = useTenantApiUrl();
    const t = useTranslations('notifications');
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
                        <span className="text-lg">{n.type === 'EVIDENCE' ? '📎' : n.type === 'FINDING' ? '🐛' : '🔔'}</span>
                        <div className="flex-1">
                            <p className="text-sm text-slate-200">{n.message}</p>
                            <p className="text-xs text-slate-500 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                        {!n.read && <button onClick={() => markRead(n.id)} className="btn btn-ghost btn-sm text-xs">{t('markRead')}</button>}
                    </div>
                ))}
                {notifications.length === 0 && <div className="glass-card p-12 text-center text-slate-500">{t('noNotifications')}</div>}
            </div>
        </div>
    );
}
