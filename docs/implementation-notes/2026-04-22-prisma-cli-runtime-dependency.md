# 2026-04-22 — Prisma CLI promoted to runtime dependency

**Commit:** `<pending>` fix(deploy): ship prisma CLI in runtime image

## Design

Prod boot started crashing in a restart loop. The app's entrypoint
runs `npx prisma migrate deploy` before starting Next.js. Because
`prisma` was listed as a **devDependency** and the Dockerfile
runs `npm prune --omit=dev` between the builder and runner stages,
the local Prisma binary was absent from the runtime image. `npx`
then resolved to the npm registry's `latest` tag — which had
flipped to Prisma 7.8.0. Prisma 7 removed the `url` and `directUrl`
properties from the `datasource` block (they moved to
`prisma.config.ts`), so schema validation failed immediately:

```
error: The datasource property `url` is no longer supported…
Prisma CLI Version : 7.8.0
```

Two failure modes combined:

1. **Implicit dependency**: runtime boot needed `prisma` but the
   package manifest didn't require it to be installed at runtime.
2. **Floating version**: `npx <pkg>` with no version specifier
   resolves to `latest` on every cold image, so any breaking
   major release ships into production without a git commit.

Fix:

- Move `prisma` from `devDependencies` to `dependencies` so
  `npm prune --omit=dev` keeps it in the image. The CLI is now
  a first-class runtime contract.
- Pin the version in `scripts/entrypoint.sh`
  (`npx --yes prisma@5.22.0 …`) as belt-and-braces. If anyone
  ever moves `prisma` back to devDeps, boot still resolves to a
  known-good version rather than silently pulling `latest`.

## Files

| File | Role |
|---|---|
| `package.json` | `prisma` moved to `dependencies`, removed from `devDependencies` |
| `package-lock.json` | Regenerated (`@prisma/debug`/`engines`/etc. no longer `"dev": true`) |
| `scripts/entrypoint.sh` | `npx prisma …` → `npx --yes prisma@5.22.0 …` with comment explaining the pin |
| `docs/implementation-notes/2026-04-22-prisma-cli-runtime-dependency.md` | This note |

## Decisions

- **Move to deps vs. pre-copy binary**: considered copying just
  `node_modules/prisma` and `node_modules/@prisma` from the
  builder stage after prune, but that leaves the dependency
  contract fragile (next person who inspects `package.json`
  won't see why the binary is there). Promoting to a real
  dependency is ~20 MB of image size for explicit intent.
- **Keep the entrypoint pin even with deps move**: redundancy is
  cheap here. Two mechanisms must fail before boot breaks.
- **Don't upgrade to Prisma 7**: the `prisma.config.ts` migration
  is a separate, larger piece of work (touches every
  datasource-aware test and the migration workflow). Out of
  scope for an incident fix.

## Incident timeline

1. Watchtower pulled a new image → `npm prune` removed Prisma CLI.
2. Container boot ran `npx prisma …` → npm resolved to 7.8.0.
3. Schema validation rejected `url`/`directUrl` → migrate exited 1
   → container restart loop.
4. Caddy started returning 502 to all routes (upstream down).
5. Fix deployed as a VM-side volume mount override first
   (`/opt/inflect/entrypoint-fixed.sh` → `/app/scripts/entrypoint.sh`)
   to unblock, then rolled into the repo for the next image build.
