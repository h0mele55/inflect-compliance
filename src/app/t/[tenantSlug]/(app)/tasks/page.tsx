import { getTenantCtx } from '@/app-layer/context';
import { listTasks } from '@/app-layer/usecases/task';
import { TasksClient } from './TasksClient';

export const dynamic = 'force-dynamic';

/**
 * Tasks — Server Component.
 * Fetches task list server-side (with URL filters applied),
 * delegates all interaction to client island.
 */
export default async function TasksPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;
    const ctx = await getTenantCtx({ tenantSlug });

    // Build filters from searchParams for server-side data fetch
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'type', 'severity', 'due']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const tasks = await listTasks(ctx, Object.keys(filters).length > 0 ? filters : undefined);

    return (
        <TasksClient
            initialTasks={JSON.parse(JSON.stringify(tasks))}
            initialFilters={filters}
            tenantSlug={tenantSlug}
            appPermissions={{
                tasks: ctx.appPermissions.tasks,
            }}
        />
    );
}
