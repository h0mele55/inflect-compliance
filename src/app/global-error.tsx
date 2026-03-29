'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import styles from './global-error.module.css';

/**
 * Root-level global error boundary for Next.js App Router.
 * This file is REQUIRED by the App Router to handle errors at the root layout level.
 * It must include its own <html> and <body> tags since it replaces the root layout.
 *
 * CSP NOTE: All styles are in global-error.module.css (a CSS module bundled with this
 * component). No inline style attributes are used, so style-src does not need
 * 'unsafe-inline'.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        try {
            Sentry.captureException(error, {
                tags: { digest: error.digest || 'none', boundary: 'global' },
            });
        } catch {
            console.error('[global-error.tsx] Failed to report to Sentry:', error);
        }
    }, [error]);

    return (
        <html lang="en">
            <body className={styles.body}>
                <div className={styles.container}>
                    <div className={styles.card}>
                        <div className={styles.iconWrap}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        </div>
                        <h2 className={styles.heading}>
                            Something went wrong
                        </h2>
                        <p className={styles.message}>
                            An unexpected error occurred. Our team has been notified.
                            {error.digest && (
                                <span className={styles.digest}>
                                    Error ID: {error.digest}
                                </span>
                            )}
                        </p>
                        <button
                            onClick={() => reset()}
                            className={styles.retryBtn}
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
