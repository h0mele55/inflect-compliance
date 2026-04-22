/**
 * Trigger filter evaluation.
 *
 * AutomationRule.triggerFilterJson is a simple top-level equality
 * map: `{ severity: "CRITICAL", category: "SECURITY" }`. The
 * dispatcher calls `matchesFilter(event, rule.triggerFilterJson)`
 * before firing an action. Two guiding rules:
 *
 *  - `null | undefined` filter ⇒ match any event of this type.
 *    This is the "every trigger fires" shortcut for rules that
 *    already narrow by event name alone.
 *  - Filter keys look *only* at the event's `data` payload. The
 *    metadata on the event (tenantId, actor, entity ids) is not
 *    filter-addressable because it's contract, not rule-authored.
 *
 * Richer matching (ranges, `in`, `startsWith`, boolean logic) is
 * deliberately out of scope. The moment we need one of those we
 * should land a versioned filter DSL — not overload this shape.
 */

import type { AutomationDomainEvent } from './event-contracts';
import type { AutomationTriggerFilter } from './types';

/**
 * Return true if the event should fire against a rule with this
 * filter. Unknown keys fail closed: if a rule asks for a field that
 * isn't on the payload, it doesn't match.
 */
export function matchesFilter(
    event: AutomationDomainEvent,
    filter: AutomationTriggerFilter | null | undefined
): boolean {
    if (!filter) return true;
    const data = event.data as Record<string, unknown>;
    for (const [key, expected] of Object.entries(filter)) {
        const actual = data[key];
        if (actual === undefined) return false;
        if (actual !== expected) return false;
    }
    return true;
}
