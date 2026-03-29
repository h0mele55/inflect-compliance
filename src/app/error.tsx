'use client'; // Error boundaries must be Client Components

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * Global Error Boundary for the Next.js App Router.
 * Automatically catches unhandled errors in server and client components
 * within the `/app` directory, preventing the app from crashing entirely.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Report to Sentry — wrapped in try/catch so the error boundary
        // itself never crashes (which causes "missing required error components")
        try {
            Sentry.captureException(error, {
                tags: { digest: error.digest || 'none' },
            });
        } catch {
            console.error('[error.tsx] Failed to report to Sentry:', error);
        }
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
            <div className="max-w-md w-full text-center space-y-6 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30">
                    <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <div>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Something went wrong
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        We&apos;re sorry, an unexpected error has occurred. Our team has been notified.
                        {error.digest && (
                            <span className="block mt-2 text-xs font-mono bg-gray-100 dark:bg-gray-900 px-2 py-1 rounded inline-block">
                                Error ID: {error.digest}
                            </span>
                        )}
                    </p>
                </div>

                <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                        onClick={() => reset()}
                        className="inline-flex justify-center w-full sm:w-auto px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                        Try again
                    </button>
                    <button
                        onClick={() => window.location.href = '/dashboard'}
                        className="inline-flex justify-center w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
