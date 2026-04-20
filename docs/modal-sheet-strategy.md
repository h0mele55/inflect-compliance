# Modal, Sheet, or Full Page?

This is the decision guide for Epic 54's CRUD/detail interaction model. Keep it open the next time you're adding a create, edit, or detail flow.

## TL;DR decision tree

```
Is the action a quick create / edit / confirm that finishes in one form?
├─ Yes → <Modal>      (src/components/ui/modal.tsx)
└─ No
   └─ Is it a persistent detail/inspect/quick-edit that benefits from the
      list staying visible behind it?
      ├─ Yes → <Sheet>   (src/components/ui/sheet.tsx)
      └─ No  → full page (tabbed detail, long-form editor, multi-step wizard)
```

Three patterns, one convention per pattern. If the answer is "well, it could go either way" — pick the lower-ceremony option.

---

## When to use `<Modal>`

**Use for:** create forms, edit-in-place for small payloads, confirm dialogs, justification prompts, single-action flows.

**Canonical shape:**

```tsx
<Modal
  showModal={open}
  setShowModal={setOpen}
  size="lg"                          // sm=confirm, md=single-field, lg=CRUD form
  title="New control"
  description="Create a custom control for your register."
  preventDefaultClose={saving}       // guards close during in-flight mutation
>
  <Modal.Header title="New control" description="…" />
  <Modal.Form onSubmit={handleSubmit} id="new-control-form">
    <Modal.Body>
      {error && (
        <div role="alert" id="…-error" className="… border-border-error bg-bg-error …">
          {error}
        </div>
      )}
      <fieldset className="space-y-4" disabled={saving}>
        {/* fields */}
      </fieldset>
    </Modal.Body>
    <Modal.Actions>
      <button type="button" id="…-cancel-btn" onClick={() => !saving && close()} disabled={saving}>Cancel</button>
      <button type="submit" id="…-submit-btn" disabled={!canSubmit}>Save</button>
    </Modal.Actions>
  </Modal.Form>
</Modal>
```

**Sizing:**

| Size | Use for |
|------|---------|
| `xs` | tiny confirms, shortcut-like dialogs |
| `sm` | single-field prompts, justification modals |
| `md` | two-to-three-field forms |
| `lg` | default for CRUD create/edit forms |
| `xl` | data-entry panels with side-by-side columns |

**Responsive posture:** Radix Dialog on desktop, Vaul Drawer on mobile. Nothing to configure — just use the primitive.

**References:**
- `src/app/t/[tenantSlug]/(app)/controls/NewControlModal.tsx` — classic create
- `src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx` — create + file upload
- `src/app/t/[tenantSlug]/(app)/risks/NewRiskModal.tsx` — create with sub-resource linking
- `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` — edit dialog inside a detail page

---

## When to use `<Sheet>`

**Use for:** inspect-and-edit a single row without losing list context (filters, pagination, scroll position). On desktop the list remains visible next to the sheet; on mobile the sheet becomes a bottom drawer.

**Canonical shape:**

```tsx
<Sheet
  showModal={!!selectedId}
  setShowModal={(v) => { if (!v) setSelectedId(null); }}
  size="md"                          // detail view
  title="Control detail"
  description="Quick edit from the register."
>
  <Sheet.Header title="Control detail" description="…" />
  <Sheet.Body>
    {/* read-only summary + editable fields */}
  </Sheet.Body>
  <Sheet.Actions align="between">
    <Link href={tenantHref(`/controls/${id}`)} data-testid="…-open-full">Open full detail →</Link>
    <div className="flex gap-2">
      <Sheet.Close asChild><Button variant="secondary" size="sm">Cancel</Button></Sheet.Close>
      <Button type="submit" variant="primary" size="sm" disabled={!canSave}>Save</Button>
    </div>
  </Sheet.Actions>
</Sheet>
```

**Sizing:**

| Size | Width (desktop) |
|------|-----------------|
| `sm` | 420 px |
| `md` | 540 px (default for detail) |
| `lg` | 720 px |
| `xl` | 960 px |

**Key properties:**
- **Two entry points OK.** A Sheet is typically an _additional_ entry point; row click can still open the full detail page. That's the point — the Sheet is faster for routine edits, the page is richer for deep work.
- **Read-only summary + editable fields.** Users need context about what they're editing; the summary pinpoints it without re-implementing the full detail view.
- **`Open full detail →`** escape hatch links to the canonical page so nothing is trapped in the sheet.

**References:**
- `src/app/t/[tenantSlug]/(app)/controls/ControlDetailSheet.tsx`

---

## When to stay on a **full page**

**Use for:** tabbed detail views, long-form editing (policy editor, tests authoring), multi-step workflows with branching validation, bulk import.

If any of the following is true, stay full-page:

- The surface has **tabs** (overview, evidence, tasks, activity, …).
- The surface edits **markdown/code/long-form text** in a dedicated editor.
- The surface has a **multi-step wizard** with conditional validation that materially changes the next step (e.g. tasks/new).
- The surface is a **bulk action** (import, export, AI assessment workflow).

**Decision aid:** if a user is likely to spend more than ~30 seconds on the surface, or to context-switch between sub-views of it, it's a page.

**References (kept intentionally full-page):**
- `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` — tabbed detail
- `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx` — editor + versions
- `src/app/t/[tenantSlug]/(app)/tasks/new/page.tsx` — wizard with conditional validation

---

## Conventions that apply to every surface

These aren't debatable — they're what makes the interaction model feel like one product:

| Convention | Why |
|------------|-----|
| Preserve **existing E2E form IDs** when migrating. | The pre-migration test suites keep passing against the modal; we don't spend migration budget re-writing tests. |
| **`preventDefaultClose={saving}`** or the equivalent guard during in-flight mutations. | No mid-save dismissals. |
| **Disable the whole `<fieldset>`** during in-flight save. | Covers every field at once; no per-input `disabled={saving}`. |
| **Errors in a `role="alert"` region** with a stable `data-testid`. | Screen readers announce the failure; E2E can pin the assertion without chasing the message text. |
| **Invalidate `queryKeys.<entity>.all(tenantSlug)`** on success. | Every list/filter view refreshes atomically. Don't invalidate a narrower key unless you can prove it's sufficient. |
| **Close on success**, don't redirect to a detail page — _unless_ the flow requires it (e.g. Create Control navigates so the user can start editing). | The list is already visible behind the modal; a redirect is a second context switch the user didn't ask for. |
| Provide a **legacy `/new` route** as a server redirect shim (`/entity?create=1`) when moving away from a full-page create. | Bookmarks, deep-links, and `page.goto('/entity/new')` E2E scripts keep working. |
| Use **semantic tokens** (`bg-bg-*`, `content-*`, `border-border-*`). | Light-theme work and contrast fixes land once, not per-surface. |

---

## Guardrails

- `tests/guards/modal-overlay-guard.test.ts` — fails if a new `fixed inset-0 bg-black/…` overlay appears in `src/app/t/**`. If you see this fail, use `<Modal>` or `<Sheet>` instead.
- `tests/unit/epic54-modal-consistency.test.ts` — parametric over every known migrated surface. Adding a new modal? Add its path to `MODAL_SURFACES` in that suite so the shared invariants (size, `preventDefaultClose`, `role="alert"`, cache invalidation) kick in automatically.
- `tests/unit/legacy-ui-ratchet.test.ts` — baseline ratchet on legacy `btn`/`badge` CSS classes. When you migrate a surface, you lower the baseline; never raise it.

## Adding a new surface — checklist

1. Pick the pattern (Modal / Sheet / page) using the tree at the top.
2. Copy the closest reference surface and adapt the fields.
3. Preserve pre-existing E2E form IDs (grep for them first).
4. Wire the canonical invariants: size, `preventDefaultClose`, `role="alert"` error, cache invalidation.
5. If it's a new migrated modal or sheet, add the path to `MODAL_SURFACES` / `SHEET_SURFACES` in `tests/unit/epic54-modal-consistency.test.ts`.
6. If it replaced a `/new` page, rewrite the old page as a server redirect shim.
