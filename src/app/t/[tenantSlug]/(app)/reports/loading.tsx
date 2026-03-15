/**
 * Reports loading skeleton — shown via Next.js Suspense while
 * the server component fetches report data.
 */
export default function ReportsLoading() {
    return (
        <div className="animate-pulse space-y-6 p-6">
            {/* Page title */}
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />

            {/* Tab bar */}
            <div className="flex gap-2">
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32" />
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded w-32" />
            </div>

            {/* Table skeleton */}
            <div className="rounded-lg border overflow-hidden">
                {/* Header */}
                <div className="h-12 bg-gray-100 dark:bg-gray-800 border-b" />
                {/* Rows */}
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-12 border-b px-4 flex items-center gap-4">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/6" />
                    </div>
                ))}
            </div>
        </div>
    );
}
