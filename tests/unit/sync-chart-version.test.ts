/**
 * scripts/sync-chart-version.mjs — semantic-release prepareCmd that
 * keeps Chart.yaml::appVersion in lock-step with package.json::version.
 *
 * The recurring bug it prevents: every release commit on main bumps
 * package.json but not Chart.yaml, and the next PR fails the structural
 * guard at tests/guards/helm-chart-foundation.test.ts:69 until someone
 * manually catches up. Without these tests there's nothing locking in
 * the script's regex shape.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/sync-chart-version.mjs');

const SAMPLE_CHART = `apiVersion: v2
name: inflect
type: application
version: 0.1.0

# App version — must match package.json version.
appVersion: "1.37.1"

kubeVersion: ">= 1.28.0"
`;

function writeTempChart(content: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'sync-chart-'));
    const file = path.join(dir, 'Chart.yaml');
    writeFileSync(file, content);
    return file;
}

function runScript(
    args: string[],
    overridePath: string | null,
): { code: number | null; stdout: string; stderr: string } {
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (overridePath) env.CHART_PATH_OVERRIDE = overridePath;
    else delete env.CHART_PATH_OVERRIDE;
    const result = spawnSync('node', [SCRIPT, ...args], {
        env,
        encoding: 'utf8',
    });
    return {
        code: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

describe('scripts/sync-chart-version.mjs', () => {
    let chartPath: string;

    beforeEach(() => {
        chartPath = writeTempChart(SAMPLE_CHART);
    });

    afterEach(() => {
        // mkdtemp creates `<tmpdir>/sync-chart-XXXXX/Chart.yaml`;
        // remove the parent directory.
        rmSync(path.dirname(chartPath), { recursive: true, force: true });
    });

    // ─── Write mode ──────────────────────────────────────────────

    it('rewrites appVersion in place when version differs', () => {
        const result = runScript(['1.38.0'], chartPath);

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('1.38.0');
        const updated = readFileSync(chartPath, 'utf8');
        expect(updated).toContain('appVersion: "1.38.0"');
        expect(updated).not.toContain('appVersion: "1.37.1"');
    });

    it('preserves the surrounding YAML structure (no clobbered lines)', () => {
        runScript(['1.38.0'], chartPath);
        const updated = readFileSync(chartPath, 'utf8');
        // The line BELOW appVersion in the sample is `kubeVersion: ">= 1.28.0"`.
        // A regex that swallows the trailing newline (the bug found during
        // first run of this script) would concatenate appVersion with the
        // next line.
        expect(updated).toContain('appVersion: "1.38.0"\n');
        expect(updated).toContain('kubeVersion: ">= 1.28.0"');
    });

    it('round-trips: writing the same version produces an identical file', () => {
        const before = readFileSync(chartPath, 'utf8');
        const result = runScript(['1.37.1'], chartPath);
        expect(result.code).toBe(0);
        const after = readFileSync(chartPath, 'utf8');
        expect(after).toBe(before);
    });

    // ─── Check mode ──────────────────────────────────────────────

    it('--check exits 0 when chart already matches', () => {
        const result = runScript(['--check', '1.37.1'], chartPath);
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('already at 1.37.1');
    });

    it('--check exits 1 with DRIFT message when chart is stale', () => {
        const result = runScript(['--check', '1.38.0'], chartPath);
        expect(result.code).toBe(1);
        expect(result.stderr).toContain('DRIFT');
        // Should not have written anything.
        const after = readFileSync(chartPath, 'utf8');
        expect(after).toContain('appVersion: "1.37.1"');
    });

    // ─── Defensive paths ─────────────────────────────────────────

    it('exits 1 when the appVersion line is missing (template refactor)', () => {
        const refactored = SAMPLE_CHART.replace(/appVersion:.*$/m, '# appVersion: removed');
        const refactoredPath = writeTempChart(refactored);
        try {
            const result = runScript(['1.38.0'], refactoredPath);
            expect(result.code).toBe(1);
            expect(result.stderr).toContain('appVersion line not found');
            // Tells the future engineer where to fix it.
            expect(result.stderr).toContain('sync-chart-version.mjs');
        } finally {
            rmSync(path.dirname(refactoredPath), { recursive: true, force: true });
        }
    });

    it('exits 2 on missing version arg (usage error)', () => {
        const result = runScript([], chartPath);
        expect(result.code).toBe(2);
        expect(result.stderr).toContain('Usage:');
    });

    it('exits 2 on non-semver version arg', () => {
        const result = runScript(['not-a-version'], chartPath);
        expect(result.code).toBe(2);
        expect(result.stderr).toContain('non-semver');
    });

    it('accepts semver with prerelease + build metadata', () => {
        const result = runScript(['1.38.0-rc.1+build.99'], chartPath);
        expect(result.code).toBe(0);
        const updated = readFileSync(chartPath, 'utf8');
        expect(updated).toContain('appVersion: "1.38.0-rc.1+build.99"');
    });

    // ─── End-to-end against the real chart (read-only sanity) ────

    it('--check against the real Chart.yaml using package.json::version exits 0 (lock-step invariant)', () => {
        // Consume the same source of truth the structural guard at
        // tests/guards/helm-chart-foundation.test.ts:69 checks.
        const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
        const result = runScript(['--check', pkg.version], null);
        if (result.code !== 0) {
            // Surface the hint message so a CI failure here pinpoints
            // the drift that needs an immediate manual chart bump.
            console.error(result.stderr);
        }
        expect(result.code).toBe(0);
    });
});

// Suppress the unused execFileSync warning — we use spawnSync above
// because it captures the exit code instead of throwing on non-zero,
// which is exactly what we need for "exits N" assertions.
void execFileSync;
