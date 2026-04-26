/**
 * Hub-and-spoke organization auto-provisioning engine (Epic O-2).
 *
 * Three lifecycle entry points keep the ORG_ADMIN ↔ AUDITOR
 * relationship coherent across the org's child tenants:
 *
 *   1. `provisionOrgAdminToTenants(orgId, userId)`
 *      Fan-out on ORG_ADMIN add. For every tenant in the org, create
 *      an AUDITOR `TenantMembership` tagged with `provisionedByOrgId`.
 *
 *   2. `provisionAllOrgAdminsToTenant(orgId, tenantId)`
 *      Fan-out on tenant add. For every existing ORG_ADMIN of the
 *      org, create the same AUDITOR membership in the new tenant.
 *
 *   3. `deprovisionOrgAdmin(orgId, userId)`
 *      Fan-in on ORG_ADMIN remove. Delete ONLY rows tagged with this
 *      org's id (and whose role is AUDITOR — defence-in-depth). Manual
 *      memberships (provisionedByOrgId = NULL) and rows from a
 *      different org survive untouched.
 *
 * ## Idempotency
 *
 * Both fan-out functions use `createMany({ skipDuplicates: true })`.
 * The unique constraint that drives the conflict is the existing
 * `@@unique([tenantId, userId])` on TenantMembership. Skipping on
 * conflict means:
 *   - Re-running the fan-out is a no-op.
 *   - A pre-existing manual ADMIN/EDITOR/READER row is preserved
 *     (never overwritten with AUDITOR).
 *   - A pre-existing auto-provisioned row from this same org is left
 *     in place.
 *
 * Deprovision uses `deleteMany` — naturally idempotent (zero rows
 * matching the predicate is a successful no-op).
 *
 * ## Why no RLS bypass
 *
 * These functions cross tenant boundaries (one ORG_ADMIN add fans out
 * to N tenants). They run on the global Prisma client, which Postgres
 * sees as the `postgres` role. The `superuser_bypass` policy on
 * `TenantMembership` (`USING (current_setting('role') != 'app_user')`)
 * fires here and grants access — that's the legitimate privileged
 * path. RLS is not turned off; the role just isn't `app_user`. Same
 * pattern as `tenant-invites.ts:redeemInvite`.
 *
 * ## Why no audit emission inside the service
 *
 * Audit attribution requires a `tenantId` and a request context, but
 * these operations are inherently cross-tenant and are usually
 * triggered from an org-level API route. The caller (which owns the
 * org-level `OrgContext`) is the right place to emit a single org-
 * level audit event summarising the fan-out, plus optional per-tenant
 * audit rows if desired. The service returns rich result metadata so
 * the caller has everything it needs.
 *
 * ## Allowlist
 *
 * This file is the seventh allowlisted membership-creation site.
 * Registered in `tests/guardrails/no-auto-join.test.ts` so a future
 * "where does this membership row come from?" audit reads exactly
 * this file.
 */

import { Role } from '@prisma/client';

import prisma from '@/lib/prisma';

// ── Result types ──────────────────────────────────────────────────────

export interface ProvisionResult {
    /** Number of NEW TenantMembership rows actually inserted. */
    created: number;
    /**
     * Number of (tenantId, userId) pairs that already had a membership
     * and were skipped via the unique-constraint conflict. Sum of
     * `created + skipped` is `totalConsidered`.
     */
    skipped: number;
    /** Total number of (tenantId, userId) pairs the call considered. */
    totalConsidered: number;
}

export interface DeprovisionResult {
    /** Number of auto-provisioned memberships actually deleted. */
    deleted: number;
    /**
     * Tenant ids the user was deprovisioned from. The caller can use
     * this to emit per-tenant audit rows or trigger downstream
     * notifications. Empty when no rows matched.
     */
    tenantIds: string[];
}

// ── Provision: fan-out ON ORG_ADMIN ADD ───────────────────────────────

/**
 * Provision an ORG_ADMIN into every tenant under `orgId`.
 *
 * Caller is responsible for verifying that:
 *   - the user already holds an `OrgMembership(role=ORG_ADMIN)` for
 *     this org (or is about to — this function does not enforce that
 *     pre-condition, on purpose, so callers can sequence the inserts
 *     in their preferred order).
 *
 * Idempotent + safe under retries. Re-running with no schema state
 * change yields the same final state and reports `created=0,
 * skipped=N, totalConsidered=N`.
 */
export async function provisionOrgAdminToTenants(
    orgId: string,
    userId: string,
): Promise<ProvisionResult> {
    const tenants = await prisma.tenant.findMany({
        where: { organizationId: orgId },
        select: { id: true },
    });
    if (tenants.length === 0) {
        return { created: 0, skipped: 0, totalConsidered: 0 };
    }

    const result = await prisma.tenantMembership.createMany({
        data: tenants.map((t) => ({
            tenantId: t.id,
            userId,
            role: Role.AUDITOR,
            provisionedByOrgId: orgId,
        })),
        skipDuplicates: true,
    });

    return {
        created: result.count,
        skipped: tenants.length - result.count,
        totalConsidered: tenants.length,
    };
}

// ── Provision: fan-out ON TENANT ADD ──────────────────────────────────

/**
 * Provision every existing `ORG_ADMIN` of `orgId` into the newly-
 * linked `tenantId`. Called from the tenant-creation path right after
 * the new Tenant + Tenant.organizationId link is committed.
 *
 * `ORG_READER` members are deliberately excluded — readers don't
 * drill down into per-tenant detail and so don't need the
 * AUDITOR `TenantMembership`.
 */
export async function provisionAllOrgAdminsToTenant(
    orgId: string,
    tenantId: string,
): Promise<ProvisionResult> {
    const admins = await prisma.orgMembership.findMany({
        where: { organizationId: orgId, role: 'ORG_ADMIN' },
        select: { userId: true },
    });
    if (admins.length === 0) {
        return { created: 0, skipped: 0, totalConsidered: 0 };
    }

    const result = await prisma.tenantMembership.createMany({
        data: admins.map((a) => ({
            tenantId,
            userId: a.userId,
            role: Role.AUDITOR,
            provisionedByOrgId: orgId,
        })),
        skipDuplicates: true,
    });

    return {
        created: result.count,
        skipped: admins.length - result.count,
        totalConsidered: admins.length,
    };
}

// ── Deprovision: fan-in ON ORG_ADMIN REMOVE ───────────────────────────

/**
 * Reverse the auto-provisioning. Deletes ONLY rows that match BOTH:
 *   - `provisionedByOrgId === orgId` (this exact org tagged the row)
 *   - `role === AUDITOR` (defence-in-depth: the column is intended
 *     for AUDITOR rows only; refusing to widen lets a misconfigured
 *     row survive for a human to investigate rather than silently
 *     vanish).
 *
 * Manual memberships (`provisionedByOrgId IS NULL`) and rows
 * provisioned by a different org are intentionally untouched. A user
 * who is ORG_ADMIN in two orgs and gets removed from one keeps their
 * AUDITOR memberships in the other org's tenants.
 *
 * Wrapped in a transaction so the result's `tenantIds` reflects
 * exactly which rows were deleted — without the transaction, a
 * concurrent provisioner could insert a row between the read and
 * the delete and skew the metadata. (The deletion itself would still
 * be correct under the schema's unique constraint; only the result
 * shape benefits from the lock.)
 */
export async function deprovisionOrgAdmin(
    orgId: string,
    userId: string,
): Promise<DeprovisionResult> {
    return prisma.$transaction(async (tx) => {
        const targets = await tx.tenantMembership.findMany({
            where: {
                userId,
                provisionedByOrgId: orgId,
                role: Role.AUDITOR,
            },
            select: { tenantId: true },
        });

        if (targets.length === 0) {
            return { deleted: 0, tenantIds: [] };
        }

        const result = await tx.tenantMembership.deleteMany({
            where: {
                userId,
                provisionedByOrgId: orgId,
                role: Role.AUDITOR,
            },
        });

        return {
            deleted: result.count,
            tenantIds: targets.map((t) => t.tenantId),
        };
    });
}
