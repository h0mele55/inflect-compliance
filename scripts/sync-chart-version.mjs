#!/usr/bin/env node
/**
 * Sync Helm Chart appVersion to a target version string.
 *
 * Used by semantic-release's `@semantic-release/exec` plugin during
 * the prepare phase: when a new release version is computed, this
 * script rewrites `infra/helm/inflect/Chart.yaml::appVersion` so the
 * chart ships in lock-step with `package.json::version`. Without
 * this, every PR opened after a release fails the structural guard
 * at `tests/guards/helm-chart-foundation.test.ts:69` until someone
 * manually bumps the chart (the recurring drift PR #53 unblocked).
 *
 * Usage:
 *   node scripts/sync-chart-version.mjs <version>
 *   node scripts/sync-chart-version.mjs --check <version>   (no write — CI dry-run)
 *
 * Exit codes:
 *   0 — appVersion now matches the target (write or check mode)
 *   1 — pattern not found in Chart.yaml (template likely refactored)
 *   2 — usage error
 *
 * Validation: the regex must match exactly one line. If the chart
 * gets reformatted (multi-line yaml, single-quoted strings, leading
 * whitespace) the script fails LOUDLY with a non-zero exit rather
 * than silently no-op'ing — the latter would re-introduce the same
 * drift this script was created to prevent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// `CHART_PATH_OVERRIDE` exists ONLY for the unit test in
// `tests/unit/sync-chart-version.test.ts`; production callers
// (semantic-release prepareCmd) never set it. The override is an env
// var rather than a CLI flag so the prod-facing argv stays minimal.
const CHART_PATH = process.env.CHART_PATH_OVERRIDE
    ? resolve(process.env.CHART_PATH_OVERRIDE)
    : resolve(__dirname, '..', 'infra/helm/inflect/Chart.yaml');

// Match a top-level `appVersion: "X.Y.Z"` line. Anchored to the
// start of a line (no leading whitespace) so we don't accidentally
// rewrite a comment or a nested `appVersion:` field. Trailing
// whitespace is matched with `[ \t]*` (NOT `\s*`) so the regex
// doesn't gobble the newline — replacing into `appVersion: "..."`
// would otherwise concatenate the following line.
const APP_VERSION_RE = /^appVersion:[ \t]*"[^"]*"[ \t]*$/m;

function usage() {
    console.error('Usage: node scripts/sync-chart-version.mjs [--check] <version>');
    process.exit(2);
}

const args = process.argv.slice(2);
let checkOnly = false;
let version;
for (const a of args) {
    if (a === '--check') checkOnly = true;
    else if (!version) version = a;
    else usage();
}
if (!version) usage();

// Light validation: semver-shaped (major.minor.patch with optional
// prerelease/build). Don't import a full semver lib — semantic-release
// already validates the version it passes us; this is just a guard
// against accidental shell-arg confusion (e.g. a flag landing here).
if (!/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version)) {
    console.error(`sync-chart-version: refusing to write non-semver value: ${version}`);
    process.exit(2);
}

const original = readFileSync(CHART_PATH, 'utf8');
const updated = original.replace(APP_VERSION_RE, `appVersion: "${version}"`);

if (!APP_VERSION_RE.test(original)) {
    console.error(
        `sync-chart-version: appVersion line not found in ${CHART_PATH}. ` +
        'The chart template was likely refactored — update the regex in ' +
        'scripts/sync-chart-version.mjs to match the new format.',
    );
    process.exit(1);
}

if (checkOnly) {
    if (updated === original) {
        console.log(`sync-chart-version: Chart.yaml already at ${version}`);
        process.exit(0);
    }
    console.error(
        `sync-chart-version: DRIFT — Chart.yaml::appVersion does not match ${version}. ` +
        'Run `node scripts/sync-chart-version.mjs <version>` to fix, ' +
        'or merge the latest release-bump from main.',
    );
    process.exit(1);
}

writeFileSync(CHART_PATH, updated);
console.log(`sync-chart-version: Chart.yaml::appVersion → ${version}`);
