-- Epic 1, PR 2 — Last-OWNER guard (defence-in-depth).
--
-- The usecase layer in updateTenantMemberRole / removeTenantMember
-- also rejects "leave tenant with zero OWNERs" operations, but a
-- bypass (raw Prisma deleteMany, cross-cutting concern not threaded
-- through the check) would silently remove the last OWNER. The DB
-- trigger is the backstop — even a misbehaving usecase cannot
-- orphan a tenant.

CREATE OR REPLACE FUNCTION check_not_last_owner()
RETURNS TRIGGER AS $$
DECLARE
    owner_count INT;
    affected_tenant TEXT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Care only about OWNER being demoted or deactivated.
        IF OLD.role = 'OWNER' AND OLD.status = 'ACTIVE'
           AND (NEW.role != 'OWNER' OR NEW.status != 'ACTIVE') THEN
            affected_tenant := OLD."tenantId";
        ELSE
            RETURN NEW;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.role = 'OWNER' AND OLD.status = 'ACTIVE' THEN
            affected_tenant := OLD."tenantId";
        ELSE
            RETURN OLD;
        END IF;
    END IF;

    SELECT COUNT(*) INTO owner_count
    FROM "TenantMembership"
    WHERE "tenantId" = affected_tenant
      AND "role" = 'OWNER'
      AND "status" = 'ACTIVE'
      AND "id" != OLD."id";

    IF owner_count < 1 THEN
        RAISE EXCEPTION 'LAST_OWNER_GUARD: tenant % would have zero active OWNERs', affected_tenant
            USING ERRCODE = 'P0001';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenant_membership_last_owner_guard ON "TenantMembership";
CREATE TRIGGER tenant_membership_last_owner_guard
BEFORE UPDATE OR DELETE ON "TenantMembership"
FOR EACH ROW EXECUTE FUNCTION check_not_last_owner();
