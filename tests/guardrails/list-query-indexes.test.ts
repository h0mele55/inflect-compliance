/**
 * GAP-perf — structural ratchet for the list-query composite indexes.
 *
 * The migration `20260428154941_perf_list_query_indexes` adds 9
 * composite indexes that match real filter shapes in the list
 * usecases. This guardrail asserts:
 *
 *   1. Each index is declared in `prisma/schema.prisma` so the
 *      Prisma client knows it can use them.
 *   2. The `migration.sql` file exists and contains a CREATE INDEX
 *      for each (so a fresh DB applies them, not just a DB whose
 *      schema state happens to drift).
 *
 * Why a structural test:
 *   - `prisma migrate dev` is happy as long as the schema and the
 *     migration history agree. It's possible to remove an index
 *     from the schema in a "cleanup" PR while leaving an unrelated
 *     migration still mentioning it — the cleanup ships, the
 *     planner loses the index on next deploy, list latency
 *     regresses by 10-100ms with no test failure to flag it.
 *   - The runtime cost of these indexes was justified per
 *     filter shape in the migration comments. Removing one without
 *     also removing the corresponding filter is a regression.
 *
 * If a future PR genuinely needs to drop an index (e.g. replacing
 * `[tenantId, score]` with a covering index), update the
 * EXPECTED_INDEXES list below in the same diff and explain the
 * replacement in the PR description.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readPrismaSchema } from '../helpers/prisma-schema';

const REPO_ROOT = path.resolve(__dirname, '../..');
const MIGRATION_PATH = path.join(
    REPO_ROOT,
    'prisma/migrations/20260428154941_perf_list_query_indexes/migration.sql',
);

interface ExpectedIndex {
    /** PascalCase model name in the schema */
    model: string;
    /** Field list in declaration order — matches the @@index([...]) line */
    fields: string[];
    /** Filter or sort path that justifies this index */
    justification: string;
}

const EXPECTED_INDEXES: readonly ExpectedIndex[] = [
    // Risk
    {
        model: 'Risk',
        fields: ['tenantId', 'ownerUserId'],
        justification: 'RiskFilters.ownerUserId',
    },
    {
        model: 'Risk',
        fields: ['tenantId', 'score'],
        justification: 'RiskFilters.scoreMin/scoreMax range',
    },
    {
        model: 'Risk',
        fields: ['tenantId', 'inherentScore'],
        justification: "listRisks default sort: orderBy: { inherentScore: 'desc' }",
    },
    // Control
    {
        model: 'Control',
        fields: ['tenantId', 'ownerUserId'],
        justification: 'ControlListFilters.ownerUserId (existing [ownerUserId] is not tenant-prefixed)',
    },
    {
        model: 'Control',
        fields: ['tenantId', 'category'],
        justification: 'ControlListFilters.category',
    },
    // Evidence
    {
        model: 'Evidence',
        fields: ['tenantId', 'status'],
        justification: 'EvidenceListFilters.status',
    },
    {
        model: 'Evidence',
        fields: ['tenantId', 'controlId'],
        justification: 'EvidenceListFilters.controlId — control-detail evidence pull',
    },
    {
        model: 'Evidence',
        fields: ['tenantId', 'type'],
        justification: 'EvidenceListFilters.type',
    },
    // ControlTask
    {
        model: 'ControlTask',
        fields: ['tenantId', 'status', 'dueAt'],
        justification: 'Dashboard overdue-tasks predicate + runConsistencyCheck overdue lookup',
    },
];

function readSchema(): string {
    return readPrismaSchema();
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
    // @@index([fieldA, fieldB, ...]) — Prisma format
    return new RegExp(`@@index\\(\\[\\s*${inner}\\s*\\]`);
}

describe('GAP-perf — list-query composite indexes', () => {
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
                // Format: CREATE INDEX IF NOT EXISTS "Risk_tenantId_ownerUserId_idx"
                //              ON "Risk" ("tenantId", "ownerUserId");
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
            // Defence against drift: if a future PR adds a
            // `CREATE INDEX` to this migration, EXPECTED_INDEXES
            // above must list it (so removal still trips the
            // ratchet).
            // Match only SQL statements (line starting with CREATE),
            // not mentions inside comment blocks.
            const createIndexCount = (migration.match(/^CREATE INDEX/gim) || []).length;
            expect(createIndexCount).toBe(EXPECTED_INDEXES.length);
        });
    });
});
