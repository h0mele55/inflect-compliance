'use client';

/**
 * Root-level global error boundary for Next.js App Router.
 * This file is REQUIRED by the App Router to handle errors at the root layout level.
 * It must include its own <html> and <body> tags since it replaces the root layout.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html lang="en">
            <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#0f172a', color: '#e2e8f0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
                    <div style={{ maxWidth: '28rem', width: '100%', textAlign: 'center', padding: '32px', borderRadius: '12px', background: '#1e293b', border: '1px solid #334155' }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
                            Something went wrong
                        </h2>
                        <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '24px' }}>
                            An unexpected error occurred. Our team has been notified.
                            {error.digest && (
                                <span style={{ display: 'block', marginTop: '8px', fontSize: '0.75rem', fontFamily: 'monospace', background: '#0f172a', padding: '4px 8px', borderRadius: '4px' }}>
                                    Error ID: {error.digest}
                                </span>
                            )}
                        </p>
                        <button
                            onClick={() => reset()}
                            style={{ padding: '8px 24px', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}
                        >
                            Try again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
