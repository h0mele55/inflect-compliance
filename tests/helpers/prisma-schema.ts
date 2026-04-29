/**
 * Prisma schema test helper.
 *
 * GAP-09 split the monolithic `prisma/schema.prisma` into a folder
 * (`prisma/schema/`) holding base/auth/compliance/vendor/audit/
 * automation/enums/schema files. Tests that previously read the
 * monolith with `fs.readFileSync('prisma/schema.prisma')` now need
 * the concatenated content of the whole folder — that is what
 * Prisma itself sees at codegen time.
 *
 * `readPrismaSchema()` is the single entry point. It is sync (most
 * guardrail tests are synchronous) and caches the result for the
 * test process so 30+ guard tests don't re-read the same files.
 *
 * Concatenation order is deterministic (alphabetical filename) so
 * substring-search assertions get the same text every run.
 */
import * as fs from 'fs';
import * as path from 'path';

const SCHEMA_DIR = path.resolve(__dirname, '../../prisma/schema');

let cached: string | null = null;

/**
 * Read every `.prisma` file under `prisma/schema/`, concatenated in
 * alphabetical filename order, and return as one string. The result
 * matches the content Prisma's parser sees when it loads the folder.
 *
 * Use this anywhere a test previously read `prisma/schema.prisma`
 * to a string. It is a drop-in replacement for that path.
 */
export function readPrismaSchema(): string {
    if (cached !== null) return cached;
    const files = fs
        .readdirSync(SCHEMA_DIR)
        .filter((f) => f.endsWith('.prisma'))
        .sort();
    cached = files
        .map((f) => fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf-8'))
        .join('\n');
    return cached;
}

/**
 * Path of the schema FOLDER for tooling that wants to invoke
 * Prisma CLI commands like `prisma migrate diff --schema=...`.
 *
 * Returns the absolute path of `prisma/schema/`.
 */
export function getPrismaSchemaDir(): string {
    return SCHEMA_DIR;
}
