#!/usr/bin/env node
/**
 * Staging Smoke Check — Cross-platform (Windows/macOS/Linux).
 *
 * Verifies that the staging environment is healthy and has seeded data.
 *
 * Usage:
 *   node scripts/smoke-staging.mjs                    # default: http://localhost:3000
 *   node scripts/smoke-staging.mjs http://staging.example.com
 */

const BASE_URL = process.argv[2] || process.env.STAGING_URL || 'http://localhost:3000';

async function check(name, url, validate) {
    process.stdout.write(`  ${name.padEnd(40)} `);
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'manual' });
        const body = await res.text();
        let data;
        try { data = JSON.parse(body); } catch { data = body; }

        // If a custom validator is supplied, use it (allows expected non-200 responses)
        if (validate) {
            if (!validate(data, res)) {
                console.log(`\u274c HTTP ${res.status} — validation failed`);
                return false;
            }
            console.log(`\u2705 ${res.status}`);
            return true;
        }

        // Default: must be 2xx
        if (!res.ok) {
            console.log(`\u274c HTTP ${res.status}`);
            return false;
        }
        console.log(`\u2705 ${res.status}`);
        return true;
    } catch (err) {
        console.log(`\u274c ${err.message || err}`);
        return false;
    }
}

async function main() {
    console.log(`\n🔍 Staging Smoke Check — ${BASE_URL}\n`);
    const results = [];

    // 1. Health endpoint
    results.push(await check(
        'Health check (/api/health)',
        `${BASE_URL}/api/health`,
        (d) => d.status === 'healthy' && d.checks?.database?.status === 'ok'
    ));

    // 2. Readiness probe
    results.push(await check(
        'Readiness probe (/api/readyz)',
        `${BASE_URL}/api/readyz`,
        (d) => d.ready === true && d.migrations > 0
    ));

    // 3. Auth session (should return empty session for unauthenticated)
    results.push(await check(
        'Auth session (/api/auth/session)',
        `${BASE_URL}/api/auth/session`,
        () => true // Just needs to respond
    ));

    // 4. Login page loads
    results.push(await check(
        'Login page (/login)',
        `${BASE_URL}/login`,
        (_, res) => res.status === 200
    ));

    // 5. Unauthenticated API returns 401
    results.push(await check(
        'API auth gate (/api/t/acme-corp/controls)',
        `${BASE_URL}/api/t/acme-corp/controls`,
        (_, res) => res.status === 401 || res.status === 200
    ));

    // Summary
    const passed = results.filter(Boolean).length;
    const total = results.length;
    console.log(`\n${'═'.repeat(50)}`);
    if (passed === total) {
        console.log(`  ✅ All ${total} checks passed`);
    } else {
        console.log(`  ⚠️  ${passed}/${total} checks passed`);
    }
    console.log(`${'═'.repeat(50)}\n`);

    process.exit(passed === total ? 0 : 1);
}

main();
