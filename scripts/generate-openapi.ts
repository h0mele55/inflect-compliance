/**
 * GAP-10 step 3 — generate `public/openapi.json` from the annotated
 * Zod schemas.
 *
 * Run via:
 *   npm run openapi:generate
 *
 * Output: `public/openapi.json` (committed). Next.js serves the
 * `public/` tree at the root path, so the spec is reachable at
 * `/openapi.json` for the Swagger UI route at `/api/docs` (GAP-10
 * step 4) and for any external SDK-generation tooling.
 *
 * Determinism: the only dynamic input is `package.json::version`,
 * which surfaces as `info.version`. No timestamps, no env-dependent
 * paths. Two runs without code changes produce byte-identical output
 * — that's what the future `tests/contracts/openapi-snapshot.test.ts`
 * (GAP-10 step 5) ratchet relies on.
 *
 * Coverage: walks every Zod schema annotated with `.openapi(name, ...)`
 * across the request-schema and response-DTO modules, registers them
 * on the shared registry from `src/lib/openapi/registry.ts`, and
 * emits the resulting OpenAPI 3.1 document. Adding a new annotated
 * schema is a one-import-line change here — see the import block
 * below.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { registry } from '@/lib/openapi/registry';

// ─── Force every annotated module to evaluate ───────────────────────
//
// Importing each module triggers its top-level `.openapi(...)` calls
// at module-load time, which writes the metadata into the schemas'
// `_def.openapi`. We then walk the exports below and `register()`
// them on the shared registry so the generator picks them up.
//
// When a new annotated schema module ships, add its import here.

import * as requestSchemas from '@/lib/schemas';
import * as commonDTOs from '@/lib/dto/common';
import * as controlDTOs from '@/lib/dto/control.dto';
import * as riskDTOs from '@/lib/dto/risk.dto';
import * as evidenceDTOs from '@/lib/dto/evidence.dto';
import * as policyDTOs from '@/lib/dto/policy.dto';
import * as auditDTOs from '@/lib/dto/audit.dto';
import * as assetDTOs from '@/lib/dto/asset.dto';
import * as taskDTOs from '@/lib/dto/task.dto';
import * as vendorDTOs from '@/lib/dto/vendor.dto';
import * as frameworkDTOs from '@/lib/dto/framework.dto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(REPO_ROOT, 'public/openapi.json');

// ─── Helpers ────────────────────────────────────────────────────────

interface ZodLike {
    parse: unknown;
    _def?: { openapi?: { _internal?: { refId?: string }; metadata?: { id?: string } } };
}

function isAnnotatedZod(value: unknown): value is ZodLike {
    return Boolean(
        value &&
            typeof value === 'object' &&
            typeof (value as { parse?: unknown }).parse === 'function' &&
            typeof (value as { _def?: unknown })._def === 'object',
    );
}

function getRefId(schema: ZodLike): string | undefined {
    const meta = schema._def?.openapi;
    if (!meta) return undefined;
    return meta._internal?.refId ?? meta.metadata?.id;
}

/**
 * Register every annotated schema in `ns` on the shared registry,
 * skipping schemas already registered (deprecated re-export aliases —
 * `CreateIssueSchema === CreateTaskSchema`, same JS object, same
 * annotation; only register once).
 */
function registerAnnotated(ns: Record<string, unknown>, moduleLabel: string): number {
    let count = 0;
    const seen = new Set<unknown>();
    for (const value of Object.values(ns)) {
        if (!isAnnotatedZod(value)) continue;
        if (seen.has(value)) continue;
        seen.add(value);
        const refId = getRefId(value);
        if (!refId) continue;
        // Skip if a definition with this refId already exists
        // (handles cross-module re-exports cleanly).
        const alreadyRegistered = registry.definitions.some((d) => {
            const def = d as { schema?: ZodLike };
            return def.schema && getRefId(def.schema) === refId;
        });
        if (alreadyRegistered) continue;
        registry.register(refId, value as never);
        count++;
    }
    if (count === 0) {
        console.warn(`[generate-openapi] WARNING: no annotated schemas found in ${moduleLabel}`);
    }
    return count;
}

// ─── Walk every imported module ─────────────────────────────────────

const sources: Array<{ ns: Record<string, unknown>; label: string }> = [
    { ns: requestSchemas, label: '@/lib/schemas' },
    { ns: commonDTOs, label: '@/lib/dto/common' },
    { ns: controlDTOs, label: '@/lib/dto/control.dto' },
    { ns: riskDTOs, label: '@/lib/dto/risk.dto' },
    { ns: evidenceDTOs, label: '@/lib/dto/evidence.dto' },
    { ns: policyDTOs, label: '@/lib/dto/policy.dto' },
    { ns: auditDTOs, label: '@/lib/dto/audit.dto' },
    { ns: assetDTOs, label: '@/lib/dto/asset.dto' },
    { ns: taskDTOs, label: '@/lib/dto/task.dto' },
    { ns: vendorDTOs, label: '@/lib/dto/vendor.dto' },
    { ns: frameworkDTOs, label: '@/lib/dto/framework.dto' },
];

let totalRegistered = 0;
for (const { ns, label } of sources) {
    const n = registerAnnotated(ns, label);
    console.log(`[generate-openapi] ${label}: registered ${n} schemas`);
    totalRegistered += n;
}

// ─── Build the document ─────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf-8')) as {
    version: string;
    name: string;
};

const generator = new OpenApiGeneratorV31(registry.definitions);
const doc = generator.generateDocument({
    openapi: '3.1.0',
    info: {
        title: 'Inflect Compliance API',
        version: pkg.version,
        description:
            'Multi-tenant compliance-management API. The schema layer in `src/lib/schemas/index.ts` ' +
            '(request bodies) and `src/lib/dto/*.dto.ts` (response shapes) is the single source of ' +
            'truth — this document is generated from those Zod schemas via `npm run openapi:generate`.',
        license: { name: 'Proprietary' },
    },
    servers: [
        {
            url: 'https://app.example.com',
            description: 'Production',
        },
        {
            url: 'https://staging.example.com',
            description: 'Staging',
        },
        {
            url: 'http://localhost:3000',
            description: 'Local development',
        },
    ],
});

// ─── Stable JSON serialisation ──────────────────────────────────────
// JSON.stringify with a 2-space indent is deterministic IF the input
// object key order is stable. The asteasolutions generator emits keys
// in registration order, which is the order of imports above — also
// stable. So a clean run produces byte-identical output.

const json = JSON.stringify(doc, null, 2) + '\n';

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, json, 'utf-8');

const componentCount = Object.keys(doc.components?.schemas ?? {}).length;
console.log(`[generate-openapi] Wrote ${OUTPUT_PATH}`);
console.log(`[generate-openapi] OpenAPI ${doc.openapi}`);
console.log(`[generate-openapi] info.version: ${doc.info.version}`);
console.log(`[generate-openapi] components.schemas: ${componentCount}`);
console.log(`[generate-openapi] Total registered (including duplicates skipped): ${totalRegistered}`);
