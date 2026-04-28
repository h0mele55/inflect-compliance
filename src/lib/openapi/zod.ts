/**
 * Zod ↔ OpenAPI integration point.
 *
 * `extendZodWithOpenApi(z)` is a runtime side effect that adds the
 * `.openapi(name, metadata?)` method to every Zod schema instance.
 * The package's TypeScript module augmentation is automatic when the
 * package is imported into the type-graph; the runtime extension
 * needs to happen exactly once before any `.openapi()` call.
 *
 * Pattern:
 *   - This module re-exports `z`. Callers that want to annotate
 *     schemas import from here:
 *
 *       import { z } from '@/lib/openapi/zod';
 *       export const FooSchema = z.object({...}).openapi('Foo');
 *
 *   - Schema files that don't add `.openapi()` calls keep
 *     `import { z } from 'zod'` — no churn forced on schemas that
 *     aren't part of the documented API surface.
 *
 *   - The `extendZodWithOpenApi(z)` call mutates the prototype that
 *     ALL Zod schemas share, so even schemas defined in files using
 *     the bare `import { z } from 'zod'` syntax can have `.openapi()`
 *     called on them at runtime once this module has been loaded.
 *     The TypeScript type does not surface the method on those
 *     schemas, however, so prefer importing from this module
 *     wherever you intend to annotate.
 */
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

extendZodWithOpenApi(z);

export { z };
