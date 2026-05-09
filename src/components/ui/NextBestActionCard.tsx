"use client";

/**
 * `<NextBestActionCard>` — state-driven recommendation card (v2-PR-11).
 *
 * Replaces the Quick-Actions 6-button grid (the previous "here are
 * six things you could do" pattern) with a SINGLE decisive
 * recommendation: "here's what you should do next."
 *
 * Why this is a feature
 *   The 6-button grid presented all actions as co-equal — no
 *   hierarchy, no situational awareness. Premium products tell users
 *   what to do next based on current state. Linear surfaces "fix
 *   broken builds" when a build is failing; Stripe surfaces
 *   "verify your bank account" when payments are pending. IC's
 *   compliance equivalent is the readiness chain.
 *
 * Priority chain (first hit wins):
 *   1. Overdue evidence → "Refresh overdue evidence"
 *   2. Overdue tasks    → "Resolve overdue tasks"
 *   3. High-severity risks (count > 0) → "Review high-severity risks"
 *   4. Coverage < 80%   → "Improve control coverage"
 *   5. Default          → "Run readiness check"
 *
 * Below the primary CTA: a quiet 3-link "quick adds" row in muted
 * text — preserves the most useful "create" affordances without the
 * 6-button noise.
 *
 * Pairs with:
 *   - <DashboardLayout> (v2-PR-6) — typical placement is the footer
 *     of the dashboard composition.
 *   - <HeroMetric> (v2-PR-10) — the hero shows the verdict; this
 *     card shows the action that improves the verdict.
 */

import * as React from "react";
import Link from "next/link";

import { Card } from "./card";
import { Heading } from "./typography";
import { Button } from "./button";
import {
    resolveNextBestAction,
    type NextBestAction,
    type NextBestActionInput,
} from "./next-best-action-logic";

export {
    resolveNextBestAction,
    type NextBestAction,
    type NextBestActionInput,
};

export interface QuickAdd {
    label: string;
    href: string;
}

export interface NextBestActionCardProps {
    input: NextBestActionInput;
    tenantHref: (path: string) => string;
    /**
     * Optional muted "quick adds" row rendered below the primary
     * CTA. Capped at 3 entries — more than that defeats the purpose
     * of the card. Pages should pick the highest-frequency creates.
     */
    quickAdds?: QuickAdd[];
    className?: string;
}

export function NextBestActionCard({
    input,
    tenantHref,
    quickAdds,
    className,
}: NextBestActionCardProps) {
    const action = resolveNextBestAction(input, tenantHref);

    return (
        <Card
            className={className}
            data-next-best-action
            data-next-best-action-id={action.id}
        >
            <Heading level={3} className="mb-1">
                {action.label}
            </Heading>
            <p
                className="text-sm text-content-muted mb-4"
                data-next-best-action-description
            >
                {action.description}
            </p>
            <Link href={action.href}>
                <Button
                    variant="primary"
                    size="md"
                    data-testid="next-best-action-cta"
                >
                    {action.label}
                </Button>
            </Link>
            {quickAdds && quickAdds.length > 0 && (
                <div
                    className="mt-4 pt-3 border-t border-border-subtle flex flex-wrap items-center gap-tight text-xs text-content-subtle"
                    data-next-best-action-quick-adds
                >
                    <span className="font-medium text-content-muted">
                        Quick add:
                    </span>
                    {quickAdds.slice(0, 3).map((qa, i) => (
                        <React.Fragment key={qa.href}>
                            {i > 0 && <span aria-hidden="true">·</span>}
                            <Link
                                href={qa.href}
                                className="text-content-muted hover:text-content-emphasis transition-colors duration-150 ease-out"
                            >
                                {qa.label}
                            </Link>
                        </React.Fragment>
                    ))}
                </div>
            )}
        </Card>
    );
}
