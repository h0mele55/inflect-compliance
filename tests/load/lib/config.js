// Shared k6 scenario config. Reads everything from environment so the
// same script works across local dev, CI, and against a remote staging
// environment without code changes.
//
// Defaults match prisma/seed.ts so a clean `npm run db:reset` is the
// only setup needed for local runs.

export function loadConfig() {
    return {
        // Target host. E2E uses :3006 (production-mode `next start`),
        // dev uses :3000. Either is fine — the scripts don't care.
        baseUrl: __ENV.BASE_URL || 'http://localhost:3006',

        // Seeded credentials from prisma/seed.ts (admin@acme.com).
        // Use a dedicated load-test user against staging/prod by
        // setting LOAD_TEST_EMAIL + LOAD_TEST_PASSWORD.
        email: __ENV.LOAD_TEST_EMAIL || 'admin@acme.com',
        password: __ENV.LOAD_TEST_PASSWORD || 'password123',

        // Seeded tenant slug.
        tenant: __ENV.LOAD_TEST_TENANT || 'acme-corp',

        // Concurrency + sustained duration for the steady-state phase.
        // Used by the ramping-vus executor stages in each scenario.
        vus: parseInt(__ENV.VUS || '50', 10),
        duration: __ENV.DURATION || '2m',

        // Ramp profile (kept short by default so a single 2 min run is
        // dominated by steady-state samples, not the ramp).
        rampUp: __ENV.RAMP_UP || '30s',
        rampDown: __ENV.RAMP_DOWN || '15s',
    };
}
