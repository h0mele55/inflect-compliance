/**
 * Per-tenant DEK rotation — alias route.
 *
 *   POST  /api/t/:tenantSlug/admin/rotate-dek
 *   GET   /api/t/:tenantSlug/admin/rotate-dek?jobId=<id>
 *
 * GAP-22 specifies this short URL form. The canonical route lives at
 * `/api/t/:tenantSlug/admin/tenant-dek-rotation/` to match the rest
 * of the admin namespace (`/admin/key-rotation`,
 * `/admin/tenant-dek-rotation`, `/admin/sso`, …) which uses the
 * resource-noun rather than verb-object naming. Keeping both paths
 * avoids breaking any operator scripts already pointed at the
 * canonical URL while delivering the GAP-22-spec URL surface.
 *
 * Both URLs share the same handler module — there is exactly one
 * implementation, so authorization, rate-limiting, audit, and the
 * GET-status semantics stay in lockstep across the alias and the
 * canonical path. If a future reorganisation drops one URL, this
 * file is the single deletion point.
 */
export {
    POST,
    GET,
} from '../tenant-dek-rotation/route';
