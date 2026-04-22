# 2026-04-22 — Epic 60 hardening (platform completion)

**Commit:** _(stamped post-commit)_

Final Epic 60 prompt. Closes out the epic by: (1) sweeping the
remaining inline tab-bar duplicates the earlier rollout left behind,
(2) writing a contributor decision-tree guide, (3) bolting on a
ratchet that prevents the sunsetted patterns from creeping back.
After this commit, Epic 60 is production-credible: the shared hook
library and polish primitives are the canonical choice, discoverable
from CLAUDE.md, documented in a single guide, and guarded against
regression.

## Design

The hardening strategy is the same shape Epic 51 and Epic 52 used:

```
Shared primitive exists  +  Docs say "use it"  +  Ratchet caps legacy count at floor
     │                        │                       │
     ▼                        ▼                       ▼
  Usable today           Discoverable              Undo-proof

  @/components/ui/hooks  docs/epic-60-*.md          tests/guards/epic60-
  @/components/ui/*                                 ratchet.test.ts
```

Nothing here is novel — it's the boring, durable pattern the rest of
the UI platform already follows.

## Files

| File | Change |
|---|---|
| `src/app/t/[tenantSlug]/(app)/mapping/page.tsx` | SOC2/NIS2 toggle → `<ToggleGroup>` |
| `src/app/t/[tenantSlug]/(app)/tests/page.tsx` | all/due/failed filter → `<ToggleGroup size="sm">` |
| `src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx` | likelihood + impact `<input type=number>` → `<NumberStepper size="sm">`; dropped unused `setNum` helper |
| `src/app/t/[tenantSlug]/(app)/admin/AdminClient.tsx` | log/templates toggle → `<ToggleGroup>` |
| `src/app/t/[tenantSlug]/(app)/admin/notifications/page.tsx` | settings/stats toggle → `<ToggleGroup>` |
| `src/app/t/[tenantSlug]/(app)/admin/sso/page.tsx` | OIDC/SAML toggle → `<ToggleGroup>` (with `id` on each option to preserve `#sso-tab-oidc`/`#sso-tab-saml` anchors) |
| `src/app/t/[tenantSlug]/(app)/reports/ReportsClient.tsx` | soa/risk toggle → `<ToggleGroup>` (with `id` to preserve `#soa-tab-btn`/`#risk-tab-btn` — referenced by `tests/e2e/reporting.spec.ts`) |
| `src/components/ui/toggle-group.tsx` | Added optional `id` field on `ToggleGroupOption` for stable-DOM-id consumers (mirrors the `idPrefix` escape hatch `TabSelect` got in the rollout prompt) |
| `docs/epic-60-shared-hooks-and-polish.md` | **new** — decision guide for when to use each hook and polish primitive; contributor checklist; link to ratchet |
| `CLAUDE.md` | Added Epic 60 row in the UI Platform section; bumped header to "Epics 51–60" |
| `tests/guards/epic60-ratchet.test.ts` | **new** — 5-assertion ratchet: raw `<input type=number>` cap, inline Enter-handler cap, banned raw `localStorage.*Item` in `src/app/**`, banned hand-rolled tab-bar pattern, barrel completeness |

## Decisions

- **Ratchet semantics: count caps, not outright bans.** Two raw
  `<input type="number">` remain (vendor assessment, admin security) —
  both are *large-range or unbounded* fields where NumberStepper's
  +/- UX would be actively worse than an input. One inline Enter
  handler remains (MFA OTP verify) because its `code.length === 6`
  precondition is genuinely cleaner inline. Rather than force-migrate
  these against the design grain, we cap the counts at their
  post-rollout floor. New code can't add another; these ones can
  migrate on their own time if someone has a better idea.

- **`localStorage.*Item` in `src/app/**` banned entirely (cap=0).**
  The three legitimate direct-`localStorage` modules (theme provider,
  filter presets, column-visibility utils) all live in
  `src/components/**` or `src/lib/**`. Nothing in app-layer `src/app/**`
  should be re-implementing persistence — `useLocalStorage` wraps
  the same storage with hydration-safety + cross-tab sync, and
  `useColumnVisibility` already handles the one non-trivial case.

- **Added `id` to `ToggleGroupOption` to match TabSelect's
  `idPrefix`.** The reports page has `#soa-tab-btn` + `#risk-tab-btn`
  selectors in `tests/e2e/reporting.spec.ts`. Migrating to ToggleGroup
  without a way to pin the ids would have broken the E2E suite; we
  didn't want to update two files for a cleanup. Per-option `id` is
  a natural extension of the primitive API (TabSelect already had
  the same shape via `idPrefix`) — it cost 2 lines of component
  code and prevented a cascading test-file rewrite.

- **Tab-bar heuristic ratchet is a narrow regex, not AST analysis.**
  The pattern matches `onClick={() => setTab(...)} className={\`btn … btn-(primary|secondary|ghost)`} — exactly the pre-Epic-60
  footprint every migrated tab bar had. Future contributors writing
  an original tab bar with a different pattern won't trip the
  ratchet, but our past copy-paste template can't come back. Close
  enough; a stricter AST-level guard would cost more maintenance
  than it would prevent.

- **Contributor guide lives in `docs/`, not in the hook-package
  README.** The `src/components/ui/hooks/README.md` is about *hook
  conventions* (SSR safety, naming, cleanup) — it's for people
  adding a new hook. `docs/epic-60-shared-hooks-and-polish.md` is
  about *hook choice* — it's for people building a feature and
  deciding what to reach for. Different audiences, different docs.

## Epic 60 complete

| Checkpoint | Status |
|---|---|
| Shared hook library hardened (persistence, optimistic, viewport, scroll, input/submit, keyboard) | ✅ 14 hooks, SSR-safe, cleanup-safe, 100+ tests |
| Polish primitive layer (Accordion / TabSelect / ToggleGroup / Slider / NumberStepper) | ✅ Token-backed, CVA variants, a11y-verified, 30 tests |
| Barrel discoverability | ✅ `@/components/ui/hooks` barrel; guard enforces completeness |
| Production rollout | ✅ 10 surfaces migrated across 3 prompts (rollout + hardening) |
| Contributor guidance | ✅ `docs/epic-60-shared-hooks-and-polish.md` + CLAUDE.md entry |
| Regression prevention | ✅ 5-assertion ratchet at `tests/guards/epic60-ratchet.test.ts` |
| Test count | 646 tests pass across 59 suites (+5 from this prompt) |

**Implementation notes trail** (chronological):

1. `2026-04-22-epic-60-hooks-foundation.md` — canonical home + barrel + README + guardrail
2. `2026-04-22-epic-60-observer-scroll-hooks.md` — viewport/observer/scroll hardening
3. `2026-04-22-epic-60-persistence-optimistic.md` — useLocalStorage + useOptimisticUpdate
4. `2026-04-22-epic-60-input-submit-hooks.md` — useEnterSubmit + useInputFocused
5. `2026-04-22-epic-60-polish-primitives.md` — Accordion / TabSelect / ToggleGroup / Slider / NumberStepper
6. `2026-04-22-epic-60-rollout.md` — 5 high-ROI integration sites
7. `2026-04-22-epic-60-hardening.md` (this note) — cleanup + docs + ratchet

The platform is ready for follow-up work to land on top of it
without re-litigating the primitive choices. Future epics can
assume the shared layer exists and is the canonical choice.
