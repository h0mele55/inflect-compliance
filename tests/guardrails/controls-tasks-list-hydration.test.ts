/**
 * Hydration-fetch ratchet for the controls + tasks list pages.
 *
 * The SSR path returns the initial list, hydrates the client, and
 * the client's `useQuery` is supposed to honour that payload until
 * `staleTime` elapses. If `initialDataUpdatedAt` is set to `0` (or
 * `staleTime` is unset on controls), React Query treats the SSR data
 * as instantly stale and fires a duplicate `GET /controls` /
 * `GET /tasks` on hydration. Both pages also narrow the
 * server-side `_count` aggregate to the two keys the list view
 * actually reads — bloating it back to six is a silent perf
 * regression.
 *
 * This guardrail catches all three regressions structurally so
 * future refactors can't reintroduce them without an explicit diff.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('list-page hydration shape', () => {
    const controlsClient = read(
        'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
    );
    const tasksClient = read(
        'src/app/t/[tenantSlug]/(app)/tasks/TasksClient.tsx',
    );

    test('ControlsClient sets initialDataUpdatedAt + staleTime on the list useQuery', () => {
        expect(controlsClient).toMatch(/initialDataUpdatedAt:\s*filtersMatchInitial\s*\?\s*Date\.now\(\)/);
        expect(controlsClient).toMatch(/staleTime:\s*30_000/);
    });

    test('TasksClient sets initialDataUpdatedAt + staleTime on the list useQuery', () => {
        expect(tasksClient).toMatch(/initialDataUpdatedAt:\s*filtersMatchInitial\s*\?\s*Date\.now\(\)/);
        expect(tasksClient).toMatch(/staleTime:\s*30_000/);
    });

    test('neither client uses the regression shape `initialDataUpdatedAt: 0` standalone', () => {
        // The literal "initialDataUpdatedAt: 0," with no ternary is the
        // pre-fix shape. Allow it to appear only inside the ternary fallback.
        const badShape = /initialDataUpdatedAt:\s*0\s*[,\n}]/;
        expect(controlsClient).not.toMatch(badShape);
        expect(tasksClient).not.toMatch(badShape);
    });
});

describe('ControlRepository list `_count` projection', () => {
    const repo = read('src/app-layer/repositories/ControlRepository.ts');

    // Both `list()` and `listPaginated()` feed the same client
    // surface (ControlsClient renders `_count?.controlTasks` and
    // `_count?.evidenceLinks` only — see ControlsClient.tsx:411,616).
    // Fetching the other four (`evidence`, `risks`, `assets`,
    // `contributors`) costs a correlated subquery per row and the
    // values are dropped. Lock the projection.
    const ALLOWED = /_count:\s*\{\s*select:\s*\{\s*controlTasks:\s*true,\s*evidenceLinks:\s*true\s*\}\s*\}/g;

    test('list() and listPaginated() expose only the consumed _count keys', () => {
        const matches = repo.match(ALLOWED) ?? [];
        // Two functions, one occurrence each.
        expect(matches.length).toBe(2);
    });

    test('no list-shape _count includes the unused four keys', () => {
        // `getById` (detail read) intentionally keeps the wider _count
        // because the detail page renders all four. Scope this check to
        // the two list functions by slicing between method headers.
        const listSection = repo.slice(
            repo.indexOf('static async list('),
            repo.indexOf('static async getById('),
        );
        expect(listSection).not.toMatch(/contributors:\s*true/);
        expect(listSection).not.toMatch(/assets:\s*true/);
        // `evidence: true` and `risks: true` are also dropped — but both
        // names recur as relations elsewhere, so assert via the known-bad
        // wide-shape literal instead.
        expect(listSection).not.toMatch(
            /_count:\s*\{\s*select:\s*\{\s*evidence:\s*true,\s*risks:\s*true,\s*assets:\s*true/,
        );
    });
});
