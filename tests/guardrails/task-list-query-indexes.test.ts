/**
 * GAP-perf (Tasks) — structural ratchet for the Tasks-page composite
 * indexes added in `20260428191822_perf_tasks_indexes`.
 *
 * Sibling to `list-query-indexes.test.ts` (PR #62) which guards
 * Risk/Control/Evidence/ControlTask. Same shape, different scope —
 * keeping them separate avoids cross-PR coupling and lets each PR
 * stand on its own.
 *
 * The ratchet asserts:
 *   1. Each index is declared in `prisma/schema.prisma` so the
 *      Prisma client knows it can use it.
 *   2. The `migration.sql` file exists and contains a CREATE INDEX
 *      for each (so a fresh DB applies them, not just a DB whose
 *      schema state happens to drift).
 *   3. The migration body contains exactly the documented count of
 *      `CREATE INDEX` statements — a future PR adding an index here
 *      MUST also list it in EXPECTED_INDEXES so removing it still
 *      trips the ratchet.
 *
 * If a future PR genuinely needs to drop one of these indexes,
 * update EXPECTED_INDEXES in the same diff and explain the
 * replacement in the PR description.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(REPO_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
    REPO_ROOT,
    'prisma/migrations/20260428191822_perf_tasks_indexes/migration.sql',
);

interface ExpectedIndex {
    model: string;
    fields: string[];
    justification: string;
}

const EXPECTED_INDEXES: readonly ExpectedIndex[] = [
    {
        model: 'Task',
        fields: ['tenantId', 'priority', 'createdAt'],
        justification:
            "WorkItemRepository.list() default sort: [{ priority: 'asc' }, { createdAt: 'desc' }]",
    },
    {
        model: 'Task',
        fields: ['tenantId', 'dueAt', 'status'],
        justification:
            "due='overdue' / due='next7d' filter: dueAt range AND status NOT IN (TERMINAL_*)",
    },
    {
        model: 'TaskLink',
        fields: ['tenantId', 'entityType', 'entityId'],
        justification:
            'WorkItemRepository.list() linkedEntityType+linkedEntityId reverse-lookup',
    },
];

function readSchema(): string {
    return fs.readFileSync(SCHEMA_PATH, 'utf-8');
}

function readMigration(): string {
    return fs.readFileSync(MIGRATION_PATH, 'utf-8');
}

/**
 * Slice the schema text to just one model's body so an `@@index`
 * declared on a different model can't false-pass an assertion.
 */
function modelBody(schema: string, modelName: string): string {
    const re = new RegExp(`^model\\s+${modelName}\\s*\\{([\\s\\S]*?)^\\}`, 'm');
    const m = schema.match(re);
    if (!m) {
        throw new Error(`Cannot locate model ${modelName} in schema.prisma`);
    }
    return m[1];
}

function indexLineFor(fields: readonly string[]): RegExp {
    const inner = fields.join(',\\s*');
    return new RegExp(`@@index\\(\\[\\s*${inner}\\s*\\]`);
}

describe('GAP-perf (Tasks) — composite indexes', () => {
    let schema: string;
    let migration: string;

    beforeAll(() => {
        schema = readSchema();
        migration = readMigration();
    });

    describe('schema declarations', () => {
        for (const idx of EXPECTED_INDEXES) {
            it(`${idx.model} has @@index([${idx.fields.join(', ')}]) — ${idx.justification}`, () => {
                const body = modelBody(schema, idx.model);
                expect(body).toMatch(indexLineFor(idx.fields));
            });
        }
    });

    describe('migration SQL', () => {
        for (const idx of EXPECTED_INDEXES) {
            const indexName = `${idx.model}_${idx.fields.join('_')}_idx`;
            it(`migration creates ${indexName}`, () => {
                const re = new RegExp(
                    `CREATE INDEX IF NOT EXISTS\\s+"${indexName}"[\\s\\S]*?` +
                        `ON\\s+"${idx.model}"\\s*\\(${idx.fields
                            .map((f) => `\\s*"${f}"`)
                            .join(',\\s*')}\\s*\\)`,
                );
                expect(migration).toMatch(re);
            });
        }

        it('every index in the migration is also documented as expected here', () => {
            // Line-anchored so CREATE INDEX mentions inside comment
            // blocks don't inflate the count.
            const createIndexCount = (migration.match(/^CREATE INDEX/gim) || []).length;
            expect(createIndexCount).toBe(EXPECTED_INDEXES.length);
        });
    });
});
