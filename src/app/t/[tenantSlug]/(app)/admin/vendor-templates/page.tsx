/**
 * Epic G-3 — vendor assessment template index (admin).
 *
 * Lists the latest version of each tenant template + a "+ New
 * template" action that creates a draft and redirects to the
 * builder.
 */
import { VendorTemplatesIndexClient } from './VendorTemplatesIndexClient';

export const dynamic = 'force-dynamic';

export default function VendorTemplatesIndexPage() {
    return <VendorTemplatesIndexClient />;
}
