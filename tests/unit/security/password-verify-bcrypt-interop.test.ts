/**
 * Regression test: bcryptjs ESM/CJS interop.
 *
 * On Node ≥ 22, `await import('bcryptjs')` returns a namespace with
 * the module's exports under `.default`, NOT spread to the top level.
 * Older code that did `(await import('bcryptjs')).compare(...)` got
 * `undefined`, the call threw, the try/catch in verifyPassword
 * swallowed it, and EVERY credentials login silently failed —
 * locking out every credentials user.
 *
 * Both verifyPassword copies (canonical at src/lib/auth/passwords.ts
 * and the legacy one at src/lib/auth.ts) must normalise the import
 * shape before calling .compare. This test runs against a real
 * bcrypt hash and asserts both implementations match.
 *
 * Adding a new password-verify code path? Make sure it normalises
 * `import('bcryptjs')` the same way (look for `loadBcrypt` or the
 * `.default ?? namespace` dance) and add a case here.
 */

import { verifyPassword as verifyPasswordCanonical, hashPassword } from '@/lib/auth/passwords';
import { verifyPassword as verifyPasswordLegacy } from '@/lib/auth';

describe('verifyPassword bcryptjs interop (regression guard)', () => {
    let knownHash: string;
    const KNOWN_PASSWORD = 'CorrectHorseBatteryStaple-2026';

    beforeAll(async () => {
        // Hash with our canonical helper so the test is self-bootstrapping
        // and doesn't depend on a particular bcrypt cost / version.
        knownHash = await hashPassword(KNOWN_PASSWORD);
    }, 30_000);

    it('canonical verifyPassword (src/lib/auth/passwords.ts) returns true for matching plaintext', async () => {
        expect(await verifyPasswordCanonical(KNOWN_PASSWORD, knownHash)).toBe(true);
    });

    it('canonical verifyPassword returns false for wrong plaintext', async () => {
        expect(await verifyPasswordCanonical('not-the-password', knownHash)).toBe(false);
    });

    it('legacy verifyPassword (src/lib/auth.ts) returns true for matching plaintext', async () => {
        expect(await verifyPasswordLegacy(KNOWN_PASSWORD, knownHash)).toBe(true);
    });

    it('legacy verifyPassword returns false for wrong plaintext', async () => {
        expect(await verifyPasswordLegacy('not-the-password', knownHash)).toBe(false);
    });

    it('verifies the seed password against a stored bcrypt hash', async () => {
        // The exact hash format the prisma seed produces ($2a$10$..., 60 chars).
        // If this assertion fails, every credentials user is locked out.
        const seedStyleHash = '$2a$10$5n/FT8vHb3kM6AEANm1Z9etU.9Tn9DCwxG7i5i94HFTJggxV6IxXK';
        expect(await verifyPasswordCanonical('password123', seedStyleHash)).toBe(true);
    });
});
