/**
 * Server-only helper: deep-clone a value to a guaranteed-plain JSON
 * shape before handing it across the React Server Component → client
 * component boundary.
 *
 * ## Why this exists
 *
 * Next.js's RSC payload serializer permits a strict subset of values:
 * plain objects, arrays, primitives, and a handful of special types
 * (Date is supported but its handling cycles between Next versions
 * and bundle modes — `next dev` vs `next start`, App Router minor
 * upgrades). Any non-plain value crossing the boundary either fails
 * the build with the (somewhat opaque)
 *   "Only plain objects, and a few built-ins, can be passed to
 *    Client Components from Server Components"
 * error, or worse — silently produces an unusable payload at request
 * time without a build-time signal.
 *
 * `JSON.parse(JSON.stringify(value))` is the canonical normalization:
 * it walks the tree, drops anything non-serializable (functions,
 * symbols, undefined-valued keys, prototype chains), and produces a
 * tree the RSC serializer is guaranteed to accept. Date objects come
 * out the other side as ISO strings — which is exactly the contract
 * our DTOs already declare (most date fields are already typed as
 * `string` ISO at the schema layer; `Date` instances only arise when
 * a Prisma row leaks through unmapped).
 *
 * ## Why NOT to remove this casually
 *
 * The function looks like a no-op when the upstream usecase happens
 * to return a fully plain DTO today. It's NOT a no-op — it's a
 * safety boundary that protects against:
 *
 *   1. **Future Prisma row leakage.** A refactor that returns a
 *      `Prisma.Decimal`, `Date`, or row with a class prototype
 *      crosses the boundary unnoticed in the local dev server but
 *      fails in production builds. The clone normalizes both ways.
 *
 *   2. **Next.js minor upgrades.** Date handling at the RSC
 *      boundary has shifted between 14.x → 15.x → 15.5.x. A clone
 *      pegs us to the most-permissive shape regardless.
 *
 *   3. **Hidden non-enumerables.** Some helpers attach
 *      non-enumerable metadata to result objects; the serializer
 *      doesn't see them, but `instanceof` checks downstream might.
 *      The clone strips all of them deterministically.
 *
 * The cost is one O(n) walk per page render. For org drill-down
 * pages — bounded N, server-side — this is dwarfed by the upstream
 * DB query.
 *
 * ## When to use it
 *
 * Use at the LAST step before the page returns its client-component
 * tree. Not in the middle of a usecase, not in repository code:
 *
 *   ```ts
 *   const rows = await listFooBars(ctx);
 *   return <FooBarsTable rows={toPlainJson(rows)} />;
 *   ```
 *
 * Don't use it anywhere a Date / Decimal / bigint round-trip is
 * load-bearing — if you need those values intact, define a DTO at
 * the usecase layer that pre-stringifies them. This helper is the
 * boundary, not a transform.
 *
 * The generic preserves the type so consumers see the same shape
 * post-clone — there's no `any` poisoning.
 */
export function toPlainJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
