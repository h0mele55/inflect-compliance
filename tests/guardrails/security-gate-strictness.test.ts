/**
 * GAP-05 — Structural ratchet for CI security gate strictness.
 *
 * The audit's GAP-05 finding noted that npm audit and Trivy gates
 * had been lowered (high → critical, CRITICAL,HIGH → CRITICAL) as a
 * temporary workaround to unblock CI while the Next.js 14 line carried
 * unfixable HIGH advisories. The Next 14 → 15.5 migration cleared
 * those advisories; the migration commit also restores both gates to
 * their original strictness.
 *
 * This guardrail asserts the gates STAY restored. A future PR that
 * drops the gate back to `--audit-level=critical` or `severity:
 * "CRITICAL"` is the exact regression class the audit closed —
 * silently accepting HIGH-severity vulnerabilities to unblock a
 * merge. A written rationale + an upgrade plan tied to a specific
 * advisory must accompany any future lowering, NOT a workaround.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(rel: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

describe('GAP-05 ratchet — CI security gate strictness', () => {
    const ci = readRepoFile('.github/workflows/ci.yml');

    it('npm audit gate blocks on HIGH severity (production deps), not CRITICAL-only', () => {
        // The line we expect — exact match including the --omit=dev
        // flag (production deps). The pre-migration line was
        // `--audit-level=critical`.
        expect(ci).toMatch(/npm audit --omit=dev --audit-level=high/);
        // Regression: the previous workaround was the production-deps
        // gate at `--audit-level=critical`. A future PR that swaps it
        // back without a rationale is the class of change this
        // guardrail catches. Note: the all-deps informational scan
        // (without --omit=dev) legitimately stays at critical to
        // limit noise from dev-only packages — not an audit-blocker.
        expect(ci).not.toMatch(/npm audit --omit=dev --audit-level=critical/);
    });

    it('Trivy scan gate blocks on CRITICAL,HIGH, not CRITICAL-only', () => {
        // The Trivy gate must declare both severities. Match the
        // YAML key on its own line so the SARIF-upload step (which
        // legitimately scans all severities) doesn't accidentally
        // pass this assertion.
        expect(ci).toMatch(/severity:\s*["']CRITICAL,HIGH["']/);
        // Regression: a future PR that downgrades to severity:
        // "CRITICAL" alone reintroduces the lowered-gate posture
        // GAP-05 closed.
        // We allow `severity: "CRITICAL,HIGH,MEDIUM"` (the SARIF
        // upload uses this) but NOT `severity: "CRITICAL"` alone.
        const lines = ci.split('\n');
        const blockingGate = lines.find(
            l => l.match(/severity:/) && l.match(/\bCRITICAL\b/) && !l.match(/HIGH/),
        );
        expect(blockingGate).toBeUndefined();
    });

    it('removed the documentation comment that explained the temporary lowering', () => {
        // The pre-migration ci.yml carried explicit comments naming
        // the lowering as temporary "until Next upgrade lands". Those
        // comments are now factually incorrect — the migration landed.
        // Regression: re-introducing the comment is the precursor to
        // re-introducing the lower gate.
        expect(ci).not.toMatch(/Lowered gate from CRITICAL,HIGH/);
        expect(ci).not.toMatch(/Gate was lowered from high → critical/);
    });
});

describe('GAP-05 ratchet — Next.js version pin', () => {
    it('package.json pins next to a 15.x or higher stable, no caret, no beta', () => {
        const pkg = JSON.parse(readRepoFile('package.json')) as {
            dependencies?: Record<string, string>;
        };
        const version = pkg.dependencies?.['next'];
        expect(version).toBeDefined();
        // Regression: the pre-migration pin was `^14.2.0` which auto-
        // resolved to `14.2.35`. The Next 14 line carries unfixable
        // HIGH advisories that GAP-05 closed by moving to 15.5.x.
        expect(version).not.toMatch(/^[\^~]?14\./);
        // Must be 15.x or higher; reject any beta / rc / canary suffix.
        expect(version).toMatch(/^(15|16|17|18)\.\d+\.\d+$/);
        expect(version).not.toMatch(/beta|alpha|rc|next|canary/i);
        // Pin shape: no caret/tilde — silent drift blocked by lockfile.
        expect(version).not.toMatch(/^[\^~]/);
    });
});
