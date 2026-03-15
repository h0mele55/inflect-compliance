/**
 * Clauses loading skeleton — shown via Next.js Suspense while
 * the server component fetches clause data.
 */
export default function ClausesLoading() {
    return (
        <div className="animate-pulse space-y-6 p-6">
            {/* Page title */}
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />

            {/* Split pane: list + detail */}
            <div className="flex gap-4">
                {/* Clause list */}
                <div className="w-1/3 space-y-2">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="rounded border p-3 space-y-2">
                            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                        </div>
                    ))}
                </div>

                {/* Detail panel */}
                <div className="w-2/3 rounded-lg border p-5 space-y-4">
                    <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                    <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-40" />
                </div>
            </div>
        </div>
    );
}
