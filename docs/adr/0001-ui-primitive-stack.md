# ADR 0001 — UI primitive stack for Inflect Compliance

**Status**: Accepted — initial draft landed during Epic 54/55 hardening pass.
**Date**: 2026-04 (session timestamp).
**Deciders**: Frontend platform team.

## Context

Epics 54 and 55 replaced the ad-hoc modal/overlay + form-control patchwork with a coherent primitive layer: `<Modal>`, `<Sheet>`, `<Popover>`, `<Combobox>`, `<UserCombobox>`, `<FormField>` / `<FieldGroup>` / `<FormDescription>` / `<FormError>`, plus the classic Input / Textarea / Checkbox / RadioGroup / Switch. Every decision on how those primitives are assembled has implications years out — new primitives need to look familiar, new contributors need to know where the lines of responsibility are, and the stack needs to survive library churn.

This ADR records the non-obvious choices so a future engineer with no access to the Epic 54/55 session history can understand *why* we ended up here.

## Decisions

### 1. **Radix UI + Vaul + cmdk + CVA + Tailwind**

Chosen as the four-pillar stack:

- **Radix UI** (`@radix-ui/react-dialog`, `-popover`, `-checkbox`, `-radio-group`, `-switch`, `-label`): accessible unstyled primitives. Gives us focus trap, escape handling, ARIA wiring, keyboard nav out of the box. We style via Tailwind; Radix handles behaviour.
- **Vaul** (`vaul`): responsive drawer library. Used for the mobile fallback in `<Modal>` and `<Sheet>`. Lets the same component render as a desktop Dialog or a mobile bottom-sheet without the page author branching.
- **cmdk** (`cmdk`): command-palette primitive. Provides the fuzzy-search + listbox + keyboard nav inside `<Combobox>`. Powers both single and multi-select.
- **CVA** (`class-variance-authority`): typed variant API. Wraps Tailwind class bundles into ergonomic `size="sm"` / `variant="primary"` / `invalid={true}` inputs. Used by every sized/stated primitive.
- **Tailwind CSS** with semantic design tokens (`bg-bg-*`, `content-*`, `border-border-*`, `brand-*`, status tones). Tokens live in `src/styles/tokens.css`; the whole UI paints on them.

**Rejected alternatives**:

- **Headless UI** (`@headlessui/react`). Radix has better ARIA compliance and a wider primitive set (sheet/drawer/popover). Vaul fills Radix's mobile gap more naturally than Headless UI's transition system.
- **MUI / Chakra**. Both ship a full design system, which collides with our semantic-token + Dub-ported palette. We'd spend migration budget fighting MUI's theme system rather than owning ours.
- **Hand-rolled Dialog/Popover**. Tried in early prototypes; kept discovering focus-trap / ARIA bugs. Epic 54's "0 bespoke overlays in app pages" guardrail documents the commitment not to reinvent this.
- **Combobox alternatives** (`downshift`, `react-aria`'s `useComboBox`). `cmdk` is smaller, simpler, and already used by Epic 53's FilterSelect — reuse won.

### 2. **Source-contract tests + jsdom render tests (hybrid)**

- **Node-env source-contract tests** assert shape (`<Modal.Form>`, `role="alert"`, `invalidateQueries(…)`) by reading component source as text and running regex/structural checks. Fast (~1 min for 10k+ tests), cheap, good for ratchets.
- **jsdom rendered tests** (Epic 55 hardening) validate runtime behaviour: keyboard nav, focus trap, axe-core WCAG 2.1 AA violations, form state flow. Slower (20–30s boot) but catches bugs that shape tests miss.

Both run under the same Jest multi-project config — Tier 1 contributors don't need to know where their new test goes; pattern-match to the nearest sibling.

**Rejected**: a single jsdom-only approach. Too slow for backend guards and usecase unit tests. Node-env remains the default; jsdom is opt-in via `tests/rendered/`.

### 3. **Zod for validation — client bridge via `useZodForm`**

Server-side request schemas already live in `src/lib/schemas/` + `src/app-layer/schemas/` (Zod). The client used to reinvent validation per-form with `.trim().length > 0` checks.

`useZodForm(schema, defaults)` bridges the gap: pick the same schema the server uses, pass it to the hook, get typed `values` / `setField` / `fieldError` / `canSubmit` / `validate` with touched-state gating. Supports server-side errors via `serverErrors` override.

**Rejected**: `react-hook-form`, `formik`. Both ship a registry model (ref-based field registration) that complicates tree-shaking and feels heavy for our modal-sized forms. `useZodForm` is 150 lines with no extra deps.

### 4. **One primitive per UX, picked by decision tree**

The two strategy docs (`docs/modal-sheet-strategy.md`, `docs/combobox-form-strategy.md`) codify the choice matrix:

- Quick CRUD form or confirm → `<Modal>`.
- Persistent detail/inspect over list → `<Sheet>`.
- Tabbed long-form editing → stay full-page.
- ≥8 options or search helpful → `<Combobox>`.
- 4–7 options, no search value → `<Combobox hideSearch>`.
- 2–5 options, user-choice semantics → `<RadioGroup>`.
- People → `<UserCombobox>` (tenant-scoped fetch).
- Toggle setting → `<Switch>`.

No competing primitives for the same job. When a contributor isn't sure, the decision tree names the default.

### 5. **Ratchets, not blanket rules**

Three CI-enforced ratchets keep the rollout durable:

- `tests/unit/legacy-ui-ratchet.test.ts` — baseline count of `className="btn"` / `"badge"` usages may only decrease.
- `tests/guards/modal-overlay-guard.test.ts` — no `fixed inset-0 bg-black/60` bespoke overlays in app pages.
- `tests/guards/epic55-native-select-ratchet.test.ts` — native `<select>` count in app pages may only decrease; 11+ migrated surfaces tracked explicitly.
- `tests/guards/reverse-tabnabbing-guard.test.ts` — every `target="_blank"` pairs with `rel="noopener"`.

Ratchets are cheaper to maintain than "migrate everything now" prompts and let partial migrations ship without blocking.

### 6. **Telemetry via plug-in sink, not hard dep**

`useFormTelemetry(surface)` emits lifecycle events (open/submit/success/error/abandon). Apps register a sink once at boot via `registerFormTelemetrySink()`; the hook has no hard dependency on Sentry, PostHog, or any specific analytics library.

This keeps the UI primitive layer library-safe (zero runtime coupling to an analytics vendor) while giving product teams a drop-in observability anchor for every new form.

## Consequences

### Positive

- **Accessibility** is enforced at two layers: jsdom render tests with `jest-axe`, and the `role` / `aria-*` wiring in the primitives themselves.
- **Tenant safety** baked in: `queryKeys.<entity>.all(tenantSlug)` everywhere, `useTenantMembers(tenantSlug)` never leaks cross-tenant data, query-key cache is tenant-isolated.
- **Contributor onboarding** has one path: read the two strategy docs, copy the nearest reference surface, run `npx jest` to get instant feedback from the ratchets.
- **Design consistency** — every Combobox looks identical, every FormField labels the same way, every modal opens the same way on mobile.

### Negative / Known cost

- **Bundle size**. Radix + Vaul + cmdk + motion together add ~150KB gzipped. Static-imported on every page. Code-splitting via `dynamic(() => import('./NewControlModal'))` is a future optimisation documented in the gap analysis.
- **jsdom fragility**. Radix + Vaul occasionally need polyfills (PointerEvent, matchMedia) and ESM deps (react-markdown, @tiptap) need mock shims. `tests/rendered/setup.ts` handles this centrally.
- **Source-contract blind spots**. Regex tests can pass while runtime is broken. The hybrid jsdom layer exists to close that gap but it's opt-in, not mandatory — new primitives without render tests are a latent bug surface.

### Neutral

- Tailwind + tokens means visual changes are a `tokens.css` edit, not a per-component touch. The tradeoff is that specific pages can't deviate from the palette without a token override.
- CVA variants make some files longer (size + variant + state matrices) but give callers a typed API. Worth it for the primitive layer; overkill for one-off pages.

## Alternatives considered and rejected (summary)

| Alternative | Why rejected |
|---|---|
| Material UI / Chakra UI | Collides with our semantic-token palette; migration cost exceeds customisation value. |
| Headless UI + custom mobile sheet | Headless UI's primitive set is narrower than Radix; Vaul does the mobile sheet better. |
| react-hook-form | Registry model is heavy for our modal-sized forms; useZodForm is 150 LOC with zero deps. |
| Hand-rolled Dialog / Popover | Accessibility bugs kept shipping; Radix is the "don't do this" escape hatch. |
| Storybook up-front | High setup cost; render tests + strategy docs currently buy similar signal for less. Open door for later. |
| Single jsdom-only test environment | Too slow for the 10k backend/guard tests; hybrid multi-project config is the right tradeoff. |

## Pointers for future changes

- **Adding a new primitive**: copy the pattern of `src/components/ui/combobox/`. CVA + semantic tokens + `aria-*` wired from the start. Add render tests under `tests/rendered/`. Register it in `docs/combobox-form-strategy.md` if it's a form control.
- **Adding a new form surface**: use `<FormField>` / `<FieldGroup>`. Wire `useFormTelemetry(surface)` into the submit path. Use `useZodForm` with a server-side schema.
- **Migrating a `<select>`**: see `docs/combobox-form-strategy.md`. Decrement the ratchet baseline in `tests/guards/epic55-native-select-ratchet.test.ts`.
- **Replacing the stack** (e.g. swap Radix for Ark UI in 2028): the primitive layer is the replaceable surface. App pages only touch `<Modal>` / `<Combobox>` / `<FormField>` — a swap rewrites `src/components/ui/` but touches zero pages.
