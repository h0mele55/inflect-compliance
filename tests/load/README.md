# Load tests (k6)

Closes the auth + read-path half of GAP-11 (no meaningful load testing).
The two scenarios in this directory establish baselines for our most
common authenticated request paths under 50 / 100 / 200 virtual users.

## Scenarios

| File              | What it measures                                                  |
| ----------------- | ----------------------------------------------------------------- |
| `auth.js`         | Cold-start NextAuth credentials login throughput + p95 latency.   |
| `lists.js`        | Steady-state authenticated list reads (controls / risks / evidence). |

`auth.js` opens a fresh cookie jar per iteration so every iteration is
a real cold login (csrf → callback/credentials → session). `lists.js`
logs in once per VU and reuses the per-VU jar so we measure the
list-read path, not the auth path again.

## Prerequisites

### Install k6

k6 is a Go binary, not an npm package. Pick one:

```bash
# macOS
brew install k6

# Debian / Ubuntu
sudo gpg -k && sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt update && sudo apt install k6

# No-install — static binary
curl -sSL https://github.com/grafana/k6/releases/download/v0.55.0/k6-v0.55.0-linux-amd64.tar.gz | tar xz
./k6-v0.55.0-linux-amd64/k6 version
```

CI installs k6 via `grafana/setup-k6-action` — see
`.github/workflows/load-test.yml`.

### Bring up a target server

The scripts default to `http://localhost:3006` (the port `npm start`
uses with the production build, matching Playwright's E2E config).

```bash
# Reset the DB to known seed state (4 controls, 4 risks, etc.)
npm run db:reset

# Start the server with the load-test escape hatches enabled.
# AUTH_TEST_MODE=1 disables the progressive lockout policy (3/5/10
# fail tiers) so bcrypt can stay the bottleneck.
# RATE_LIMIT_ENABLED=0 disables the API rate-limit middleware so
# endpoint latency reflects the auth + DB path, not the limiter.
AUTH_TEST_MODE=1 RATE_LIMIT_ENABLED=0 PORT=3006 npm start
```

Wait until `curl -fsS http://localhost:3006/api/health` returns 200.

## Running the baselines

The standard 50 / 100 / 200 VU runs:

```bash
# auth scenario
npm run load:auth:50
npm run load:auth:100
npm run load:auth:200

# list scenario
npm run load:lists:50
npm run load:lists:100
npm run load:lists:200

# quick sanity check (5 VUs, 30s, both scenarios)
npm run load:smoke
```

Or directly:

```bash
k6 run -e VUS=100 -e DURATION=2m tests/load/auth.js
k6 run -e VUS=100 -e DURATION=2m tests/load/lists.js
```

Override host or credentials:

```bash
k6 run \
  -e BASE_URL=https://staging.example.com \
  -e LOAD_TEST_EMAIL=loadtest@example.com \
  -e LOAD_TEST_PASSWORD='…' \
  -e LOAD_TEST_TENANT=loadtest-corp \
  -e VUS=200 -e DURATION=2m \
  tests/load/lists.js
```

## Thresholds

A run **fails** (non-zero exit) if any of these are crossed.

### `auth.js`

| Metric                                | Budget          | Why                                         |
| ------------------------------------- | --------------- | ------------------------------------------- |
| `http_req_failed{step:csrf}`          | `rate < 1%`     | CSRF is a flat read; should never 5xx.      |
| `http_req_failed{step:login}`         | `rate < 1%`     | Login SLO ceiling.                          |
| `http_req_failed{step:session}`       | `rate < 1%`     | Session check must be reliable.             |
| `http_req_duration{step:csrf}`        | `p95 < 500ms`   | Flat read.                                  |
| `http_req_duration{step:login}`       | `p95 < 1500ms`  | Bcrypt bound — wider budget.                |
| `http_req_duration{step:login}`       | `p99 < 3000ms`  | Tail latency under contention.              |
| `http_req_duration{step:session}`     | `p95 < 500ms`   | JWT verify only.                            |
| `auth_full_login_ms`                  | `p95 < 2000ms`  | E2E login transaction.                      |
| `auth_full_login_ms`                  | `p99 < 4000ms`  | Tail latency for the full transaction.      |
| `checks{check:csrf_ok}`               | `rate > 99%`    |                                             |
| `checks{check:login_ok}`              | `rate > 99%`    |                                             |
| `checks{check:session_ok}`            | `rate > 99%`    |                                             |

### `lists.js`

| Metric                                       | Budget          | Why                                  |
| -------------------------------------------- | --------------- | ------------------------------------ |
| `http_req_failed{type:list}`                 | `rate < 1%`     | Read-path error budget.              |
| `http_req_duration{endpoint:controls}`       | `p95 < 800ms`   | Paginated list w/ auth + RLS.        |
| `http_req_duration{endpoint:controls}`       | `p99 < 2000ms`  |                                      |
| `http_req_duration{endpoint:risks}`          | `p95 < 800ms`   |                                      |
| `http_req_duration{endpoint:risks}`          | `p99 < 2000ms`  |                                      |
| `http_req_duration{endpoint:evidence}`       | `p95 < 800ms`   |                                      |
| `http_req_duration{endpoint:evidence}`       | `p99 < 2000ms`  |                                      |
| `list_success_rate`                          | `rate > 99%`    | Aggregate.                           |
| `checks{check:controls_ok}`                  | `rate > 99%`    |                                      |
| `checks{check:risks_ok}`                     | `rate > 99%`    |                                      |
| `checks{check:evidence_ok}`                  | `rate > 99%`    |                                      |
| `http_req_failed{step:login}`                | `rate < 5%`     | Once-per-VU warm-up; 5% is generous. |

These are starting budgets calibrated for the seed dataset (~4 controls,
~4 risks). When running against a heavier seed or a populated tenant
expect the list p95 to drift up — re-baseline before tightening.

> **Dev server vs production build.** The thresholds are calibrated
> for `npm start` against a production build (the same shape CI runs).
> If you point the scripts at `npm run dev` you'll see p95 latency
> 5-10× higher because Next.js compiles each route on its first hit;
> that's a property of dev mode, not a regression. For a sanity-only
> smoke against the dev server, expect threshold breaches on
> `http_req_duration{*}` while every check still passes (200 OK,
> JSON shape valid). The error shape will look like:
> `error msg="thresholds on metrics 'http_req_duration{...}' have
> been crossed"` — that's the SUT, not the script.

## Result artifacts

Each run writes a JSON summary to `tests/load/results/`:

- `auth-summary.json`
- `lists-summary.json`

The directory is gitignored; the CI workflow uploads it as an artifact.

## Configuration knobs

| env / flag              | default                  | what it does                       |
| ----------------------- | ------------------------ | ---------------------------------- |
| `BASE_URL`              | `http://localhost:3006`  | Target host.                       |
| `LOAD_TEST_EMAIL`       | `admin@acme.com`         | Login email.                       |
| `LOAD_TEST_PASSWORD`    | `password123`            | Login password.                    |
| `LOAD_TEST_TENANT`      | `acme-corp`              | Tenant slug for `/api/t/<slug>/…`. |
| `VUS`                   | `50`                     | Target concurrency.                |
| `DURATION`              | `2m`                     | Steady-state duration.             |
| `RAMP_UP`               | `30s`                    | 0 → VUS ramp.                      |
| `RAMP_DOWN`             | `15s`                    | VUS → 0 ramp.                      |

## Adding a new scenario

1. Drop `tests/load/<name>.js`. Reuse `lib/config.js` and `lib/auth.js`.
2. Define a single scenario in `options.scenarios` with `executor:
   'ramping-vus'` and the same stage shape (`rampUp`, `duration`,
   `rampDown`) so the suite stays consistent.
3. Add real thresholds. **No script ships without thresholds** — a
   "load test" with no pass/fail gates is just a benchmark, not a
   regression detector.
4. Add a `load:<name>` script to `package.json` mirroring the existing
   `load:auth` / `load:lists` entries.
5. Add it to the `scenario` choice list in
   `.github/workflows/load-test.yml`.

## Why these scenarios

GAP-11 called out `auth` and `lists` as the highest-leverage starting
points: every authenticated user hits both on every session. The auth
scenario gates regressions in the credentials path (most common
production load: thundering-herd login at the start of the workday).
The lists scenario gates regressions in the three highest-traffic
read endpoints. Mutation flows are deliberately out of scope here —
they need a different setup (idempotency, cleanup, isolation per VU)
and will land in a follow-up scenario.
