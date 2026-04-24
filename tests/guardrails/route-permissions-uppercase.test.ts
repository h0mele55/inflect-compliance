/**
 * Guardrail: every rule in `ROUTE_PERMISSIONS` that specifies HTTP
 * methods must use the canonical uppercase form from the `HttpMethod`
 * union. The compile-time type already prevents lowercase literals;
 * this test is the runtime ratchet that catches:
 *
 *   1. An `as any` or `as HttpMethod` cast that bypasses the union.
 *   2. A future `HttpMethod` extension that sneaks in a lowercase
 *      member by accident.
 *   3. A refactor that widens `methods?: readonly HttpMethod[]` back
 *      to `readonly string[]` and reintroduces the per-call
 *      `.toUpperCase()` allocation.
 *
 * Keep in lockstep with `src/lib/security/route-permissions.ts`.
 */

import {
    ROUTE_PERMISSIONS,
    type HttpMethod,
} from '@/lib/security/route-permissions';

// Mirrors the union. If HttpMethod grows, add here too — the test
// then enforces every member is strictly uppercase.
const ALLOWED_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>([
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
]);

describe('route-permissions HttpMethod hygiene', () => {
    it('every rule.methods entry is an allowed HttpMethod union member', () => {
        for (const rule of ROUTE_PERMISSIONS) {
            if (!rule.methods) continue;
            for (const method of rule.methods) {
                expect(ALLOWED_METHODS.has(method)).toBe(true);
            }
        }
    });

    it('every rule.methods entry is strictly uppercase (defence against `as` casts)', () => {
        for (const rule of ROUTE_PERMISSIONS) {
            if (!rule.methods) continue;
            for (const method of rule.methods) {
                // If something snuck through the type (e.g. `'Put' as HttpMethod`),
                // the case-equality check catches it.
                expect(method).toBe(method.toUpperCase());
            }
        }
    });

    it('ALLOWED_METHODS union contains only uppercase strings', () => {
        for (const method of ALLOWED_METHODS) {
            expect(method).toBe(method.toUpperCase());
        }
    });
});
