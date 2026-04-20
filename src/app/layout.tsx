import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers';
import { CSP_NONCE_HEADER } from '@/lib/security/csp';
import './globals.css';

export const metadata: Metadata = {
    title: 'Inflect Compliance — Платформа за съответствие по ISO 27001',
    description: 'Цялостно управление на съответствието по ISO 27001:2022 с карти на SOC 2 и NIS2.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();
    const messages = await getMessages();
    const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;

    return (
        // `data-theme="dark"` seeds the SSR markup so the first paint matches
        // the baseline palette. ThemeProvider rehydrates from localStorage /
        // prefers-color-scheme on the client and flips the attribute if needed.
        <html lang={locale} data-theme="dark" suppressHydrationWarning>
            <body suppressHydrationWarning nonce={nonce}>
                <Providers>
                    <NextIntlClientProvider messages={messages} locale={locale}>
                        {children}
                    </NextIntlClientProvider>
                </Providers>
            </body>
        </html>
    );
}
