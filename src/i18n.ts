import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
    const locale = 'bg'; // Default locale — change to 'en' for English

    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default,
    };
});
