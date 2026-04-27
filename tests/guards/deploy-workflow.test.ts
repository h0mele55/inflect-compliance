/**
 * Epic OI-2 — structural ratchet for the Helm-based deploy workflow.
 *
 * The workflow at `.github/workflows/deploy.yml` was rewritten in
 * OI-2 to use `helm upgrade --install` against EKS, replacing the
 * SSH + docker-compose path. This ratchet locks the load-bearing
 * invariants:
 *
 *   - Helm is the deploy primitive (no SSH/scp/compose calls in the
 *     workflow's run steps)
 *   - AWS auth via OIDC, cluster access via `aws eks update-kubeconfig`
 *   - Production binds to the `production` GitHub Environment (the
 *     manual-approval gate)
 *   - `helm upgrade --install` uses --atomic + --wait + --timeout
 *     (so a failed deploy auto-rolls-back and the workflow blocks
 *     until rollout completes)
 *   - Smoke tests are wired AFTER deploy
 *   - Helm chart path matches the chart from OI-2
 *
 * If one of these breaks, the diff is the design conversation.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(__dirname, '../..');
const WORKFLOW = path.join(ROOT, '.github/workflows/deploy.yml');

interface WorkflowJob {
    name?: string;
    if?: string;
    needs?: string | string[];
    environment?: string;
    'runs-on'?: string;
    permissions?: Record<string, string>;
    concurrency?: { group: string; 'cancel-in-progress'?: boolean };
    steps?: Array<Record<string, unknown>>;
    'timeout-minutes'?: number;
}

function loadWorkflow(): { jobs: Record<string, WorkflowJob> } {
    return yaml.load(fs.readFileSync(WORKFLOW, 'utf-8')) as {
        jobs: Record<string, WorkflowJob>;
    };
}

const text = () => fs.readFileSync(WORKFLOW, 'utf-8');

describe('OI-2 — deploy workflow file shape', () => {
    it('exists and parses as YAML', () => {
        expect(fs.existsSync(WORKFLOW)).toBe(true);
        expect(() => loadWorkflow()).not.toThrow();
    });

    it('has the four expected jobs (gate, build-image, deploy, smoke)', () => {
        const wf = loadWorkflow();
        expect(Object.keys(wf.jobs).sort()).toEqual([
            'build-image',
            'deploy',
            'gate',
            'smoke',
        ]);
    });

    it('the workflow_dispatch trigger exposes environment + ref + image_tag inputs', () => {
        const src = text();
        expect(src).toMatch(/workflow_dispatch:[\s\S]*?inputs:[\s\S]*?environment:/);
        expect(src).toMatch(/options:[\s\S]*?staging[\s\S]*?production/);
        expect(src).toMatch(/ref:\s*\n\s*description:/);
        expect(src).toMatch(/image_tag:\s*\n\s*description:/);
    });

    it('per-environment concurrency group with cancel-in-progress = false', () => {
        const src = text();
        // group: deploy-<env>, never cancel an in-flight deploy
        expect(src).toMatch(/group:\s*deploy-\$\{\{\s*github\.event\.inputs\.environment/);
        expect(src).toMatch(/cancel-in-progress:\s*false/);
    });
});

describe('OI-2 — Helm is the deploy primitive (no SSH/compose)', () => {
    it('contains NO appleboy/ssh-action references', () => {
        // The legacy SSH deploy used `uses: appleboy/ssh-action@v1`.
        // Removing the migration would silently keep the SSH path.
        expect(text()).not.toMatch(/appleboy\/ssh-action/);
    });

    it('contains NO `docker compose` deploy commands in run steps', () => {
        const src = text();
        // We allow the substring to appear in COMMENTS (the file's
        // header explains the migration from compose) — strip
        // comment lines before scanning.
        const codeOnly = src
            .split('\n')
            .filter((line) => !line.trim().startsWith('#'))
            .join('\n');
        expect(codeOnly).not.toMatch(/docker\s+compose\s+(?:up|down|restart|pull)/);
        expect(codeOnly).not.toMatch(/docker-compose\.\w+\.yml/);
    });

    it('contains NO references to the legacy DEPLOY_HOST / DEPLOY_USER / DEPLOY_SSH_KEY secrets', () => {
        const src = text();
        for (const legacy of [
            'DEPLOY_HOST',
            'DEPLOY_USER',
            'DEPLOY_SSH_KEY',
            'DEPLOY_PATH',
        ]) {
            expect(src).not.toMatch(new RegExp(`secrets\\.${legacy}\\b|secrets\\['${legacy}'\\]`));
        }
    });

    it('uses `helm upgrade --install` as the deploy command', () => {
        expect(text()).toMatch(/helm upgrade --install/);
    });
});

describe('OI-2 — deploy job invariants', () => {
    it('deploy job binds to the chosen GitHub Environment (gates production via required reviewers)', () => {
        const wf = loadWorkflow();
        const job = wf.jobs.deploy;
        expect(job).toBeTruthy();
        expect(job.environment).toMatch(/needs\.gate\.outputs\.target-env/);
    });

    it('deploy job uses OIDC (id-token: write) and assumes secrets.AWS_ROLE_TO_ASSUME', () => {
        const wf = loadWorkflow();
        expect(wf.jobs.deploy.permissions?.['id-token']).toBe('write');
        expect(text()).toMatch(/role-to-assume:\s*\$\{\{\s*secrets\.AWS_ROLE_TO_ASSUME\s*\}\}/);
    });

    it('uses aws-actions/configure-aws-credentials@v4 + azure/setup-helm@v4', () => {
        const src = text();
        expect(src).toMatch(/aws-actions\/configure-aws-credentials@v4/);
        expect(src).toMatch(/azure\/setup-helm@v4/);
    });

    it('updates kubeconfig via `aws eks update-kubeconfig`', () => {
        expect(text()).toMatch(/aws eks update-kubeconfig/);
    });

    it('passes the per-env values file to helm upgrade', () => {
        // `--values infra/helm/inflect/values-${env}.yaml` — the per-env
        // values files MUST be the source of env-specific config, never
        // hardcoded into the workflow.
        expect(text()).toMatch(/--values\s+"\$\{\{\s*env\.CHART_PATH\s*\}\}\/values-\$\{\{\s*needs\.gate\.outputs\.target-env\s*\}\}\.yaml"/);
    });

    it('helm upgrade is --atomic + --wait + --timeout', () => {
        // --atomic rolls back automatically on failure during the upgrade;
        // --wait blocks until rollout completes; --timeout caps the wait.
        // All three are load-bearing for the deploy ↔ smoke handoff.
        const src = text();
        expect(src).toMatch(/--atomic/);
        expect(src).toMatch(/--wait/);
        expect(src).toMatch(/--timeout/);
    });

    it('helm upgrade pins image tag from gate output', () => {
        expect(text()).toMatch(/--set image\.tag="\$\{\{\s*needs\.gate\.outputs\.image-tag\s*\}\}"/);
    });

    it('does a `helm lint` + `--dry-run` BEFORE the real helm upgrade', () => {
        const src = text();
        // Lint catches structural breakage; dry-run catches values
        // breakage that lint can't see (e.g. a values file referencing
        // a removed key). Both should run as guards before the real
        // apply.
        expect(src).toMatch(/helm lint\s+"\$\{\{\s*env\.CHART_PATH/);
        expect(src).toMatch(/--dry-run/);
    });

    it('keeps Helm history (history-max) so `helm rollback` has revisions to roll back to', () => {
        expect(text()).toMatch(/--history-max/);
    });

    it('emits a rollout summary including helm history + pods + the rollback command hint', () => {
        const src = text();
        expect(src).toMatch(/helm history/);
        expect(src).toMatch(/helm rollback/);
        // The summary should also show pods, which is the actionable
        // "is the rollout green?" surface.
        expect(src).toMatch(/kubectl[\s\S]*?get pods/);
    });
});

describe('OI-2 — smoke tests preserved after deploy', () => {
    it('smoke job runs AFTER deploy', () => {
        const wf = loadWorkflow();
        const needs = Array.isArray(wf.jobs.smoke.needs)
            ? (wf.jobs.smoke.needs as string[])
            : [wf.jobs.smoke.needs as string];
        expect(needs).toContain('deploy');
    });

    it('smoke job calls scripts/smoke-prod.mjs', () => {
        expect(text()).toMatch(/node\s+scripts\/smoke-prod\.mjs/);
    });

    it('smoke job binds to the same per-env GitHub Environment as deploy', () => {
        const wf = loadWorkflow();
        expect(wf.jobs.smoke.environment).toMatch(/needs\.gate\.outputs\.target-env/);
    });

    it('SMOKE_URL comes from the env-scoped GitHub variable, not hardcoded', () => {
        const src = text();
        expect(src).toMatch(/SMOKE_URL:\s*\$\{\{\s*vars\.SMOKE_URL\s*\}\}/);
        // No hardcoded URL like https://staging.example.com or
        // https://app.example.com in the workflow run steps.
        const codeOnly = src
            .split('\n')
            .filter((l) => !l.trim().startsWith('#'))
            .join('\n');
        expect(codeOnly).not.toMatch(/SMOKE_URL:\s*https:\/\//);
    });

    it('preserves the smoke retries / timeout knobs from the legacy workflow', () => {
        const src = text();
        expect(src).toMatch(/SMOKE_RETRIES:\s*"\d+"/);
        expect(src).toMatch(/SMOKE_RETRY_DELAY:\s*"\d+"/);
        expect(src).toMatch(/SMOKE_TIMEOUT_MS:\s*"\d+"/);
    });
});

describe('OI-2 — chart path + naming convention', () => {
    it('CHART_PATH points at infra/helm/inflect (the OI-2 chart)', () => {
        expect(text()).toMatch(/CHART_PATH:\s*infra\/helm\/inflect/);
    });

    it('release name + namespace follow the inflect-<env> convention (matches values files)', () => {
        const src = text();
        // The gate step computes RELEASE="inflect-$ENV" + NAMESPACE="inflect-$ENV"
        expect(src).toMatch(/RELEASE="inflect-\$ENV"/);
        expect(src).toMatch(/NAMESPACE="inflect-\$ENV"/);
    });
});

describe('OI-2 — docs/deployment.md has the OI-2 sections', () => {
    const DOC = path.join(ROOT, 'docs/deployment.md');
    const doc = () => fs.readFileSync(DOC, 'utf-8');

    it.each([
        '## Kubernetes (Helm)',
        '### Deploying',
        '### Rollback via `helm rollback`',
        '### Scaling',
        '### Secret rotation',
    ])('contains the section: %s', (heading) => {
        expect(doc()).toContain(heading);
    });

    it('rollback section enumerates the safety semantics (re-runs vs not, expand-and-contract)', () => {
        const src = doc();
        expect(src).toMatch(/expand[\s-]and[\s-]contract/i);
        expect(src).toMatch(/migration Job is one-way|hooks?\s+are\s+\*?\*?NOT\*?\*?\s+re-run/i);
    });

    it('secret-rotation section explicitly notes the rollout-restart requirement', () => {
        // K8s doesn't hot-reload Secret-backed env vars; rotation
        // requires a pod restart. Operators MUST know this — the
        // doc must call it out explicitly.
        expect(doc()).toMatch(/rollout restart/);
    });

    it('scaling section covers BOTH HPA-managed app and manually-scaled worker', () => {
        const src = doc();
        expect(src).toMatch(/autoscaling\.minReplicas/);
        expect(src).toMatch(/worker\.replicaCount/);
    });
});
