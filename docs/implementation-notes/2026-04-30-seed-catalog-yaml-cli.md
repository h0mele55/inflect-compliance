# 2026-04-30 — `seed-catalog` YAML ingestion + `framework:import` CLI

**Commit:** _(pending)_

Closes the "no YAML ingestion" gap in `prisma/seed-catalog.ts` and adds a
first-class operator/developer entrypoint for ad-hoc framework imports
through `npm run framework:import`.

## Design

```
                    ┌─────────────────────────────────────────┐
   YAML / JSON  ──▶ │  prisma/catalog-loader.ts                │
   on-disk file     │   ‒ detects extension (.yaml | .yml |    │
                    │     .json)                                │
                    │   ‒ js-yaml or JSON.parse                 │
                    │   ‒ Zod validation (CatalogFileSchema)    │
                    │   ‒ Cross-field validation                │
                    │     (assertCatalogConsistency)            │
                    │   ‒ Throws CatalogParseError /            │
                    │     CatalogValidationError with paths     │
                    └────────┬────────────────────────────────┘
                             │  CatalogFile (canonical shape)
                             ▼
            ┌────────────────────────────────────────┐
            │  prisma/catalog-applier.ts              │
            │   ‒ Framework upsert (key_version)      │
            │   ‒ FrameworkRequirement[] upsert       │
            │   ‒ ControlTemplate[] create-if-missing │
            │   ‒ ControlTemplateTask[] (5-task       │
            │     default playbook)                   │
            │   ‒ ControlTemplateRequirementLink[]    │
            │   ‒ FrameworkPack upsert                │
            │   ‒ PackTemplateLink[] upsert           │
            │  Idempotent — re-run is a no-op apart   │
            │  from updating mutable fields.          │
            └────────┬────────────────────────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼                           ▼
  prisma/seed-catalog.ts       scripts/framework-import.ts
  (legacy hardcoded; can       (CLI: npm run framework:import
   migrate per-framework        -- --input <path> [--dry-run])
   to use the loader at any
   later point)                Exit codes:
                                 0 ok / 1 runtime / 2 args / 3 catalog
```

## Decisions

- **Two-layer architecture: loader + applier.** Prompt 1 explicitly
  asks to "keep parsing separate from business validation". So
  parsing/validation lives in `catalog-loader.ts` (no DB import) and
  the write path in `catalog-applier.ts` (consumes a validated
  `CatalogFile`). The CLI composes them; `seed-catalog.ts` can adopt
  the same composition incrementally per framework — neither side
  has to change in lockstep.

- **Reuse `js-yaml`, not `yaml`.** The existing
  `src/app-layer/libraries/library-loader.ts` already uses `js-yaml`
  for cross-framework library imports. Adopting the same dependency
  keeps the YAML behaviour (anchors, multi-doc, schema) consistent
  across the codebase.

- **One unified ingestion boundary, format-agnostic.** Both `.yaml`
  / `.yml` and `.json` files flow through `loadCatalogFile`. Existing
  JSON fixtures could be migrated 1-for-1 to the new shape with no
  behaviour change. The dispatch is by file extension (the existing
  loader-import architecture makes this the simplest integration).

- **Explicit error taxonomy.** `CatalogParseError` (extension /
  syntax) and `CatalogValidationError` (Zod / cross-field) are
  distinct classes. The CLI maps them both to exit code 3 — distinct
  from runtime/DB errors (1) and bad-CLI-args (2). CI scripts can
  branch on input-quality vs infra issues.

- **Cross-field validation is its own pass.** Zod's per-field
  validation can't enforce "every templateCode in `pack.templateCodes`
  exists in `templates[*].code`". `assertCatalogConsistency` runs
  AFTER the schema check; reports issues with `templates[i].requirementCodes`
  / `pack.templateCodes[i]` paths so reviewers can pinpoint typos.

- **Self-contained catalog files.** A `CatalogFile` carries the
  framework + requirements + templates + pack in one document. The
  legacy seed-catalog is split across `prisma/fixtures/*.json` (just
  requirements) plus inline TS arrays (templates) plus more inline
  arrays (packs). Self-contained files keep "one framework = one
  artefact" — easier to migrate, audit, and version.

- **Demo YAML, not full migration.** `prisma/catalogs/iso27001-2022-demo.yaml`
  is a 4-control subset that exercises the YAML path end-to-end
  without disturbing the production 93-control fixture. The full
  migration (replacing the legacy require()-based fixtures with
  YAML files + an applier-based seed-catalog) is intentionally a
  follow-up — it would convert ~745 lines of JSON for ISO 27001
  alone, plus the inline TS arrays for SOC2/NIS2/ISO9001/ISO28000/
  ISO39001. This PR lands the foundation; subsequent PRs cut over
  one framework at a time.

- **CLI mirrors existing repo conventions.** `tsx scripts/X.ts`
  invocation (no `commander`/`yargs`); per-script arg parsing in
  ~40 lines; `npm run framework:import -- --flag` invocation. Same
  shape as `db:bootstrap-owners`, `db:seed`, `seed:staging`. Exit
  code contract is documented in the script header AND in `--help`.

- **Dry-run is parse + validate.** `--dry-run` returns the same
  parse/validation behaviour as `--apply` minus the DB writes. CI
  pipelines can lint catalog YAML files in a no-DB job, and
  operators can preview a file before letting it touch prod.

## Files

| File | Role |
|---|---|
| `prisma/catalog-loader.ts` | NEW. `loadCatalogFile`, `loadAndValidateCatalogFile`, `assertCatalogConsistency`, `CatalogFileSchema` (Zod), `CatalogParseError`, `CatalogValidationError`. Single ingestion boundary for YAML and JSON. |
| `prisma/catalog-applier.ts` | NEW. `applyCatalogFile(prisma, file, srcPath)` — writes Framework + Requirements + Templates + Tasks + Pack. Idempotent, mirrors seed-catalog.ts upsert sequence. |
| `prisma/catalogs/iso27001-2022-demo.yaml` | NEW. Worked example; 4-control subset of ISO 27001 Annex A used by the CLI integration test. Distinct framework key (`ISO27001_DEMO`) so it doesn't collide with the production seed. |
| `scripts/framework-import.ts` | NEW. CLI entrypoint. `--input`, `--dry-run`, `--help`. Exit codes 0/1/2/3. JSON-shape stdout summary. |
| `package.json` | New script `framework:import` invoking the CLI via `tsx`. Insertion point matches the existing `db:*` cluster. |
| `tests/unit/catalog-loader.test.ts` | NEW. 13 tests: valid YAML/JSON happy path, extension dispatch, malformed YAML/JSON, schema-invalid content, cross-field validation, unknown enum values. |
| `tests/integration/framework-import-cli.test.ts` | NEW. 8 tests: spawn-the-CLI integration. `--help`, missing `--input`, dry-run no-DB-writes, apply with idempotency check, parse error → exit 3, validation error → exit 3, cross-validation error → exit 3, unknown flag → exit 2. |

## Verification

- `npx tsc --noEmit` — clean.
- 21/21 new tests pass:
  - 13 loader unit tests (`tests/unit/catalog-loader.test.ts`)
  - 8 CLI integration tests (`tests/integration/framework-import-cli.test.ts`)
- End-to-end smoke (manual): `npm run framework:import -- --input prisma/catalogs/iso27001-2022-demo.yaml --dry-run` → exit 0, JSON summary. `npm run framework:import -- --input ...` (without `--dry-run`) → applies + idempotent re-run.

## Usage

```bash
# Validate a catalog file (no DB writes)
npm run framework:import -- --input prisma/catalogs/myframework.yaml --dry-run

# Apply to the configured DB
npm run framework:import -- --input prisma/catalogs/myframework.yaml

# Help
npm run framework:import -- --help
```

Output (apply, success):

```json
{
  "ok": true,
  "mode": "apply",
  "input": "/.../myframework.yaml",
  "framework": { "id": "...", "key": "...", "created": true },
  "requirements": { "upserted": 93 },
  "templates": { "created": 93, "existing": 0 },
  "pack": { "id": "...", "key": "...", "created": true, "templatesLinked": 93 }
}
```

Output (validation failure):

```text
Catalog validation failed in prisma/catalogs/myframework.yaml:
  ‒ framework.key: Required
  ‒ requirements: Array must contain at least 1 element(s)
```

Exit codes — `0` ok, `1` runtime/DB, `2` bad CLI args, `3` parse/validation. CI scripts can branch on input-quality vs infra issues without parsing stderr text.
