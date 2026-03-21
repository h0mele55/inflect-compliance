'use client';

import { useState } from 'react';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';

/**
 * Client component for billing actions.
 * Handles POST to checkout/portal routes and redirects to Stripe.
 */
export function BillingActions({
    plan,
    portal,
    tenantSlug,
}: {
    plan?: 'PRO' | 'ENTERPRISE';
    portal?: boolean;
    tenantSlug: string;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleCheckout() {
        if (!plan) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/billing/checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed (${res.status})`);
            }
            const { url } = await res.json();
            window.location.href = url;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setLoading(false);
        }
    }

    async function handlePortal() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/t/${tenantSlug}/billing/portal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Failed (${res.status})`);
            }
            const { url } = await res.json();
            window.location.href = url;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
            setLoading(false);
        }
    }

    if (portal) {
        return (
            <div>
                <button
                    onClick={handlePortal}
                    disabled={loading}
                    className="btn btn-primary"
                    id="billing-portal-btn"
                >
                    {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <ExternalLink className="w-4 h-4" />
                    )}
                    Manage Billing
                </button>
                {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
            </div>
        );
    }

    return (
        <div>
            <button
                onClick={handleCheckout}
                disabled={loading}
                className={`btn ${plan === 'ENTERPRISE' ? 'btn-secondary' : 'btn-primary'}`}
                id={`billing-upgrade-${plan?.toLowerCase()}-btn`}
            >
                {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                    <CreditCard className="w-4 h-4" />
                )}
                Upgrade to {plan}
            </button>
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
    );
}
