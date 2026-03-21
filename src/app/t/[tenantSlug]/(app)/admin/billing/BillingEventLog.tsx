'use client';

import { Activity, CreditCard, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

/**
 * Renders a list of recent billing events with icons and human-readable labels.
 * Receives pre-formatted events from the server component.
 */

const EVENT_CONFIG: Record<string, { label: string; icon: typeof Activity; color: string }> = {
    'checkout.session.completed': { label: 'Checkout completed', icon: CreditCard, color: 'text-emerald-400' },
    'customer.subscription.created': { label: 'Subscription created', icon: CheckCircle, color: 'text-brand-400' },
    'customer.subscription.updated': { label: 'Subscription updated', icon: Activity, color: 'text-blue-400' },
    'customer.subscription.deleted': { label: 'Subscription canceled', icon: XCircle, color: 'text-red-400' },
    'invoice.payment_failed': { label: 'Payment failed', icon: AlertTriangle, color: 'text-red-400' },
    'invoice.payment_succeeded': { label: 'Payment succeeded', icon: CheckCircle, color: 'text-emerald-400' },
};

interface BillingEvent {
    id: string;
    type: string;
    stripeEventId: string;
    createdAt: string;
}

export function BillingEventLog({ events }: { events: BillingEvent[] }) {
    if (events.length === 0) {
        return (
            <div className="glass-card p-6 text-center">
                <p className="text-sm text-slate-500">No billing events yet.</p>
            </div>
        );
    }

    return (
        <div className="glass-card overflow-hidden">
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Event</th>
                        <th>Time</th>
                        <th>Stripe ID</th>
                    </tr>
                </thead>
                <tbody>
                    {events.map(event => {
                        const config = EVENT_CONFIG[event.type] || {
                            label: event.type,
                            icon: Activity,
                            color: 'text-slate-400',
                        };
                        const Icon = config.icon;

                        return (
                            <tr key={event.id}>
                                <td>
                                    <div className="flex items-center gap-2">
                                        <Icon className={`w-4 h-4 ${config.color}`} />
                                        <span className="text-sm text-white">{config.label}</span>
                                    </div>
                                </td>
                                <td className="text-xs text-slate-400 whitespace-nowrap">
                                    {new Date(event.createdAt).toLocaleString()}
                                </td>
                                <td className="text-xs text-slate-500 font-mono">
                                    {event.stripeEventId.slice(0, 20)}…
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
