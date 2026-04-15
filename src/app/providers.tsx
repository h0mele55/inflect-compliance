'use client';

import { SessionProvider } from 'next-auth/react';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider
            // Disable automatic session polling — the middleware validates
            // the session on every request, making client-side polling redundant.
            // This also prevents ClientFetchError when pages navigate or
            // the browser context closes while a poll is in-flight.
            refetchInterval={0}
            refetchOnWindowFocus={false}
        >
            {children}
        </SessionProvider>
    );
}
