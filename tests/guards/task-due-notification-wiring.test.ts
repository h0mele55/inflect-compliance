/**
 * Event-driven TASK_DUE notification wiring ratchet.
 *
 * #592 shipped in-app task-due notifications as a daily 08:00 cron
 * only. That made them invisible whenever the scheduler had not
 * registered the repeatable, and it never fired for a task created
 * after 08:00 on its own due day. The follow-up wired the
 * notification into the task usecases so a near-term deadline
 * reaches the bell the instant a task is created / rescheduled /
 * assigned.
 *
 * This ratchet locks that wiring in: a future refactor cannot
 * silently drop the event-driven path and leave the feature
 * cron-only again.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const JOB = read('src/app-layer/jobs/task-due-notification.ts');
const TASK_USECASE = read('src/app-layer/usecases/task.ts');

describe('TASK_DUE notification — event-driven wiring', () => {
    it('the job exports the shared createTaskDueNotification helper', () => {
        expect(JOB).toMatch(
            /export async function createTaskDueNotification\b/,
        );
    });

    it('the helper is idempotent — shares the cron dedupeKey', () => {
        // Both the cron loop and the helper mint the key the same
        // way, so the two paths never double-notify.
        expect(JOB).toMatch(/buildTaskDueDedupeKey\(/);
    });

    it('the task usecase imports the helper', () => {
        expect(TASK_USECASE).toMatch(
            /import \{ createTaskDueNotification \} from ['"]\.\.\/jobs\/task-due-notification['"]/,
        );
    });

    it('createTask, updateTask and assignTask each emit the notification', () => {
        // Three call sites — one per write path. The
        // `emitTaskDueNotification` wrapper is the defensive,
        // fire-and-forget bridge to `createTaskDueNotification`.
        const callSites =
            TASK_USECASE.match(/emitTaskDueNotification\(db, ctx, task\)/g) ??
            [];
        expect(callSites.length).toBe(3);
    });

    it('the emit wrapper is defined as a fire-and-forget helper', () => {
        expect(TASK_USECASE).toMatch(
            /async function emitTaskDueNotification\(/,
        );
    });
});
