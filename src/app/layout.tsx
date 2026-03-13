import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
    title: 'Inflect Compliance — Платформа за съответствие по ISO 27001',
    description: 'Цялостно управление на съответствието по ISO 27001:2022 с карти на SOC 2 и NIS2.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html lang={locale} suppressHydrationWarning>
            <body suppressHydrationWarning>
                <Providers>
                    <NextIntlClientProvider messages={messages} locale={locale}>
                        {children}
                    </NextIntlClientProvider>
                </Providers>
            </body>
        </html>
    );
}
