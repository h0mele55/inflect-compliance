# 2026-05-20 — Task-due notifications: the event-driven path

**Commit:** `<pending> fix(tasks): emit TASK_DUE notification on create/update/assign`

## Problem

[#592](docs/implementation-notes/2026-05-20-task-due-notifications.md)
shipped in-app `TASK_DUE` notifications as a **daily 08:00 UTC cron
only**. A tenant (`inflect ltd`) still saw no notification for tasks
due today / tomorrow. Two failure modes left the cron silent:

1. **Scheduler-dependent.** The 08:00 repeatable only fires if the
   deploy-time scheduler registered it AND a BullMQ worker is running.
   If either is down, no `TASK_DUE` row is ever written. The cron is
   the *only* writer — there is no fallback.
2. **Never fires for same-day tasks created after 08:00.** A task
   created at 14:00 with `dueAt` today is already past the day's only
   scan. Its `today` window is missed forever; the next scan (next
   08:00) classifies it as overdue (`days < 0` → no window).

The cron is correct for the *steady state* — it is the wrong and only
mechanism for *the moment a deadline becomes near-term*.

## Design

Add an **event-driven path** alongside the cron, sharing one writer so
the two never double-notify.

```
                ┌─────────────────────────┐
  createTask ──▶│                         │
  updateTask ──▶│  emitTaskDueNotification │──▶ createTaskDueNotification ──▶ Notification
  assignTask ──▶│  (usecase, fire-&-forget)│         (shared helper)            (dedupeKey)
                └─────────────────────────┘                ▲
  08:00 cron ── processTaskDueNotifications ────────────────┘
```

`createTaskDueNotification(db, task, now)` is extracted from the cron
loop into an exported helper in `task-due-notification.ts`. It
classifies one task's `dueAt` into a {7,1,0}-day window and inserts
the `Notification` — returning `{ status: 'created' | 'duplicate' |
'out-of-window', window }`. The cron loop now calls it per scanned
task; the task usecases call it the instant a task is created,
rescheduled, or (re)assigned.

**Idempotency carries the whole design.** Both paths mint the same
`dedupeKey` (`{tenantId}:TASK_DUE:{window}:{taskId}:{userId}:{YYYY-MM-DD}`).
A task created at 14:00 today gets its `today` notification
immediately from the usecase; the next 08:00 cron re-attempts, trips
the `dedupeKey` unique index, and counts it `skippedDuplicate`. No
double-bell, ever — the DB enforces it.

**`emitTaskDueNotification`** is the usecase-side wrapper: a private
`task.ts` helper that early-returns when the task has no assignee, no
`dueAt`, or the context has no `tenantSlug` (the `linkUrl` needs it),
and otherwise calls the shared helper inside a `try/catch` that logs a
warning and **never throws**. A notification failure must not roll
back the task write that triggered it — the cron is the backstop.

## Files

| File | Role |
|------|------|
| `src/app-layer/jobs/task-due-notification.ts` | Extracted `createTaskDueNotification` + `TaskDueTarget` / `TaskDueNotificationOutcome`; cron loop now calls the shared helper |
| `src/app-layer/usecases/task.ts` | `emitTaskDueNotification` wrapper; wired into `createTask` / `updateTask` / `assignTask` |
| `tests/unit/task-due-notification.test.ts` | New `createTaskDueNotification` describe block — created / out-of-window / duplicate / propagating-error |
| `tests/guards/task-due-notification-wiring.test.ts` | Structural ratchet — locks the export + the 3 usecase call sites |

## Decisions

- **Extract a shared helper, do not duplicate the insert.** One
  writer means one `dedupeKey` shape; the cron and the event path are
  guaranteed consistent by construction, not by review vigilance.
- **Fire-and-forget at the usecase, never throwing.** The task write
  is the user's intent; a notification is a side effect. A SIEM-style
  "audit row already committed" fail-safe — the cron re-attempts on
  its next pass anyway.
- **Emit from `updateTask` too, not just create.** Rescheduling a
  task's `dueAt` into a near-term window is exactly the case the
  original cron-only design missed for same-day edits.
- **Keep the cron.** It still covers the steady-state transition
  (a task sitting untouched as its 7d → 1d → 0d windows arrive).
  Event path = "deadline set near"; cron = "deadline drifts near".
- **`tenantSlug` from `RequestContext`, guard when absent.** The
  notification `linkUrl` is `/t/{slug}/tasks/{id}`. `ctx.tenantSlug`
  is optional on `RequestContext`; when missing we skip rather than
  emit a broken link — the cron (which reads `tenant.slug` from the
  row) still covers it.
