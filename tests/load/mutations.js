// k6 load-test scenario — authenticated mutation baseline.
//
// Two operations per iteration:
//   1. POST /api/t/{slug}/controls         — JSON, tagged op:create_control
//   2. POST /api/t/{slug}/evidence/uploads — multipart, tagged op:upload_evidence
//
// Why a single login in setup()
//   ─────────────────────────────
// The auth scenario (auth.js) measures cold-login throughput. This
// scenario measures mutation throughput; bcrypt is irrelevant. setup()
// performs one login and hands the session cookie to every VU via the
// data object so the iteration loop is purely write-path work.
//
// Test isolation
//   ──────────────
// Every created row carries `[loadtest-<runId>-vu<N>-it<M>]` in its
// title/name field. RUN_ID defaults to `local-<timestamp>` and is
// overridable via `-e RUN_ID=...` (CI sets it to the github.run_id).
// Two consequences:
//   • Easy to bulk-delete locally — see tests/load/README.md cleanup
//     snippet.
//   • In CI the postgres service container is recreated per workflow
//     run, so tagged rows are gone the moment the job finishes.
//     No cross-PR pollution.
//
// Upload uniqueness
//   ─────────────────
// `uploadEvidenceFile` does SHA-256 dedup before persisting the
// FileRecord. Identical bytes across iterations would silently collapse
// to a single row and skew the timing distribution. Each upload here
// embeds runId + VU + iter + nonce in the file content so every
// upload is genuinely unique.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
import { loadConfig } from './lib/config.js';
import { login } from './lib/auth.js';

const cfg = loadConfig();
const RUN_ID = __ENV.RUN_ID || `local-${Date.now()}`;

const createControlOk = new Counter('mutation_create_control_ok');
const createControlFail = new Counter('mutation_create_control_fail');
const uploadEvidenceOk = new Counter('mutation_upload_evidence_ok');
const uploadEvidenceFail = new Counter('mutation_upload_evidence_fail');
const mutationLoopMs = new Trend('mutation_loop_ms', true);

export const options = {
    scenarios: {
        mutations: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: cfg.rampUp, target: cfg.vus },
                { duration: cfg.duration, target: cfg.vus },
                { duration: cfg.rampDown, target: 0 },
            ],
            gracefulRampDown: '30s',
            gracefulStop: '30s',
        },
    },
    thresholds: {
        // Mutations get a slightly looser error budget than reads (2%
        // vs 1%) because RLS + audit + encryption add real variance,
        // and the smoke profile has fewer samples (~200/op at 10 VUs
        // x 30s) so a single retry can move the rate noticeably.
        'http_req_failed{op:create_control}': ['rate<0.02'],
        'http_req_failed{op:upload_evidence}': ['rate<0.02'],

        // Latency budgets calibrated for `next start` against a CI
        // runner with the seeded DB. Control creation is one INSERT
        // + audit log; upload is file-write + 2 inserts + audit.
        'http_req_duration{op:create_control}': ['p(95)<1500', 'p(99)<3000'],
        'http_req_duration{op:upload_evidence}': ['p(95)<2000', 'p(99)<4000'],

        // Check rates — anything below 98% means real correctness
        // failures (not just slow), so we want the gate tight.
        'checks{check:control_created}': ['rate>0.98'],
        'checks{check:evidence_uploaded}': ['rate>0.98'],

        // E2E loop — control + evidence + 0.5s think — should comfortably
        // fit under 3s p95. If it doesn't, it's worth a closer look.
        mutation_loop_ms: ['p(95)<3000'],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
    discardResponseBodies: false,
};

// Single global login — shared via the setup → default data channel
// so the iteration loop never pays the bcrypt cost.
export function setup() {
    const ok = login(cfg);
    if (!ok) {
        throw new Error(
            'mutations.js setup login failed — refusing to run mutation smoke without a session. ' +
            'Verify the SUT is up at ' + cfg.baseUrl + ' with AUTH_TEST_MODE=1.',
        );
    }
    const jar = http.cookieJar();
    const cookies = jar.cookiesForURL(cfg.baseUrl);
    // NextAuth uses the secure-prefix variant on HTTPS; bare on HTTP.
    const tokenName = cookies['next-auth.session-token']
        ? 'next-auth.session-token'
        : '__Secure-next-auth.session-token';
    const tokenArr = cookies[tokenName];
    if (!Array.isArray(tokenArr) || tokenArr.length === 0) {
        throw new Error('login succeeded but no session cookie surfaced in the jar');
    }
    return { tokenName, tokenValue: tokenArr[0], runId: RUN_ID };
}

export default function (data) {
    const t0 = Date.now();
    const params = {
        cookies: { [data.tokenName]: data.tokenValue },
    };
    const tag = `loadtest-${data.runId}-vu${__VU}-it${__ITER}`;
    const base = `${cfg.baseUrl}/api/t/${cfg.tenant}`;

    // ── 1. Create control ──
    const controlBody = JSON.stringify({
        name: `[${tag}] load-test control`,
        description: 'Created by tests/load/mutations.js — safe to delete.',
        category: 'loadtest',
        status: 'NOT_STARTED',
        isCustom: true,
    });
    const controlRes = http.post(`${base}/controls`, controlBody, {
        ...params,
        headers: { 'Content-Type': 'application/json' },
        tags: { type: 'mutation', op: 'create_control' },
    });
    const controlOk = check(
        controlRes,
        {
            'control 201': (r) => r.status === 201,
            'control has id': (r) => {
                try {
                    return typeof r.json('id') === 'string';
                } catch (_e) {
                    return false;
                }
            },
            'control name persisted': (r) => {
                try {
                    const n = r.json('name');
                    return typeof n === 'string' && n.includes(tag);
                } catch (_e) {
                    return false;
                }
            },
        },
        { check: 'control_created' },
    );
    if (controlOk) createControlOk.add(1);
    else createControlFail.add(1);

    // ── 2. Upload evidence (multipart, unique bytes) ──
    const uniqueContent =
        `loadtest evidence\n` +
        `run: ${data.runId}\n` +
        `vu: ${__VU}\n` +
        `iteration: ${__ITER}\n` +
        `ts: ${Date.now()}\n` +
        `nonce: ${Math.random()}\n`;
    const formData = {
        file: http.file(uniqueContent, `${tag}.txt`, 'text/plain'),
        title: `[${tag}] load-test evidence upload`,
        category: 'loadtest',
    };
    const uploadRes = http.post(`${base}/evidence/uploads`, formData, {
        ...params,
        tags: { type: 'mutation', op: 'upload_evidence' },
    });
    const uploadOk = check(
        uploadRes,
        {
            'upload 201': (r) => r.status === 201,
            'upload has id': (r) => {
                try {
                    return typeof r.json('id') === 'string';
                } catch (_e) {
                    return false;
                }
            },
            'upload type is FILE': (r) => {
                try {
                    return r.json('type') === 'FILE';
                } catch (_e) {
                    return false;
                }
            },
        },
        { check: 'evidence_uploaded' },
    );
    if (uploadOk) uploadEvidenceOk.add(1);
    else uploadEvidenceFail.add(1);

    mutationLoopMs.add(Date.now() - t0);
    sleep(0.5);
}

export function handleSummary(summary) {
    return {
        stdout: textSummary(summary, { indent: ' ', enableColors: true }),
        'tests/load/results/mutations-summary.json': JSON.stringify(summary, null, 2),
    };
}
