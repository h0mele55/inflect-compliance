import { handlers } from '@/auth';

/** NextAuth handlers are request-dependent — never statically generate. */
export const dynamic = 'force-dynamic';

export const { GET, POST } = handlers;
