/**
 * GAP-06 — password-lifecycle hardening guardrail.
 *
 * Locks in the wiring that the audit asks for:
 *   1. Each password route imports and uses the EXACT named rate-limit
 *      preset documented in `rate-limit.ts`. A future PR that swaps
 *      FORGOT_PASSWORD_LIMIT for some looser preset has to update this
 *      test in the same diff — making the relaxation visible at review.
 *   2. Each set-password route applies the structural HIBP coverage
 *      (delegated to `hibp-coverage.test.ts`; this test sanity-checks
 *      that the routes are registered there).
 *   3. The forgot-password route does NOT contain a password field
 *      (anti-enumeration: the schema must not differ between branches).
 *
 * Mirrors the shape of `hibp-coverage.test.ts` — curated list +
 * structural assertions per route.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

interface PasswordRouteSpec {
    file: string;
    /** The exact preset name that must appear as `config: <name>` in the wrapper options. */
    expectedPreset: 'FORGOT_PASSWORD_LIMIT' | 'PASSWORD_RESET_LIMIT' | 'PASSWORD_CHANGE_LIMIT';
    /** Logical scope string passed to the wrapper. Locking it down so audit/log queries stay stable. */
    expectedScope: 'forgot-password' | 'reset-password' | 'change-password';
    /** Whether this route accepts a password field (and therefore needs HIBP coverage). */
    setsPassword: boolean;
}

const PASSWORD_ROUTES: ReadonlyArray<PasswordRouteSpec> = [
    {
        file: 'src/app/api/auth/forgot-password/route.ts',
        expectedPreset: 'FORGOT_PASSWORD_LIMIT',
        expectedScope: 'forgot-password',
        setsPassword: false,
    },
    {
        file: 'src/app/api/auth/reset-password/route.ts',
        expectedPreset: 'PASSWORD_RESET_LIMIT',
        expectedScope: 'reset-password',
        setsPassword: true,
    },
    {
        file: 'src/app/api/t/[tenantSlug]/account/password/route.ts',
        expectedPreset: 'PASSWORD_CHANGE_LIMIT',
        expectedScope: 'change-password',
        setsPassword: true,
    },
];

function readSrc(rel: string): string {
    const abs = path.join(REPO_ROOT, rel);
    expect(fs.existsSync(abs)).toBe(true);
    return fs.readFileSync(abs, 'utf8');
}

describe('GAP-06 — password-route hardening guardrail', () => {
    test.each(PASSWORD_ROUTES.map((r) => [r.file, r] as const))(
        '%s imports the named rate-limit preset',
        (_file, spec) => {
            const src = readSrc(spec.file);
            const importRe = new RegExp(
                `^\\s*import\\s+\\{[^}]*\\b${spec.expectedPreset}\\b[^}]*\\}\\s+from\\s+['\"]@/lib/security/rate-limit['\"]`,
                'm',
            );
            if (!importRe.test(src)) {
                throw new Error(
                    [
                        `Route does not import ${spec.expectedPreset} from @/lib/security/rate-limit.`,
                        ``,
                        `  File:  ${spec.file}`,
                        `  Expected import: import { ${spec.expectedPreset} } from '@/lib/security/rate-limit';`,
                        ``,
                        `If this route's threat model has changed and a different preset is correct, update`,
                        `PASSWORD_ROUTES in tests/guardrails/password-route-hardening.test.ts in the same diff.`,
                    ].join('\n'),
                );
            }
        },
    );

    test.each(PASSWORD_ROUTES.map((r) => [r.file, r] as const))(
        '%s applies the named preset via withApiErrorHandling rateLimit option',
        (_file, spec) => {
            const src = readSrc(spec.file);

            // The wrapper option block must reference the exact preset.
            // Match `config: PRESET_NAME` to avoid false positives on
            // imports / docstrings.
            const configRe = new RegExp(`config:\\s*${spec.expectedPreset}\\b`);
            if (!configRe.test(src)) {
                throw new Error(
                    [
                        `Route does not wire ${spec.expectedPreset} into the rateLimit option.`,
                        ``,
                        `  File:  ${spec.file}`,
                        `  Expected:  rateLimit: { config: ${spec.expectedPreset}, scope: '${spec.expectedScope}' }`,
                    ].join('\n'),
                );
            }

            // Lock the scope string so audit/log queries stay stable.
            const scopeRe = new RegExp(`scope:\\s*['\"]${spec.expectedScope}['\"]`);
            expect(scopeRe.test(src)).toBe(true);
        },
    );

    it('forgot-password route does NOT accept a password field (enumeration safety)', () => {
        const src = readSrc('src/app/api/auth/forgot-password/route.ts');
        // The Zod schema must not declare any password-shaped field. If
        // a future PR adds one, the schema diverges between branches
        // and timing/response-shape convergence is no longer guaranteed.
        const passwordFieldRe = /\b(password|newPassword|currentPassword|confirmPassword)\s*:\s*z\./;
        expect(passwordFieldRe.test(src)).toBe(false);

        // The schema file referenced should also not put password on
        // ForgotPasswordInput.
        const schemaSrc = readSrc('src/app-layer/schemas/password.schemas.ts');
        const forgotBlockRe = /export const ForgotPasswordInput[\s\S]+?\.strict\(\)/;
        const forgotBlockMatch = schemaSrc.match(forgotBlockRe);
        expect(forgotBlockMatch).toBeTruthy();
        expect(passwordFieldRe.test(forgotBlockMatch![0])).toBe(false);
    });

    it('every password-setting route is registered in HIBP_REQUIRED_ROUTES', () => {
        // Read the HIBP guardrail's source and check the curated-list
        // string literal contains each set-password route's file path.
        // Substring match is sufficient — the path is unique across the
        // guardrail file, no false-positive risk.
        const hibpSrc = readSrc('tests/guardrails/hibp-coverage.test.ts');
        for (const spec of PASSWORD_ROUTES) {
            if (!spec.setsPassword) continue;
            if (!hibpSrc.includes(spec.file)) {
                throw new Error(
                    [
                        `Route sets a password but is missing from HIBP_REQUIRED_ROUTES.`,
                        ``,
                        `  File:  ${spec.file}`,
                        ``,
                        `Add the entry to tests/guardrails/hibp-coverage.test.ts in the same diff.`,
                    ].join('\n'),
                );
            }
        }
    });

    it('PASSWORD_ROUTES list stays non-empty (sanity)', () => {
        expect(PASSWORD_ROUTES.length).toBeGreaterThanOrEqual(3);
    });
});
