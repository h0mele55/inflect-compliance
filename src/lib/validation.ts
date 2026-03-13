/**
 * Request validation utility using Zod.
 * 
 * Usage in route handlers:
 *   const { data, error } = await parseBody(req, MySchema);
 *   if (error) return error;
 *   // data is typed and stripped of unknown fields
 * 
 * To add validation to a new route:
 *   1. Define a schema in src/lib/schemas/
 *   2. Call parseBody(req, schema) at the top of your handler
 *   3. Unknown fields are automatically stripped
 *   4. Invalid input returns 400 with consistent error shape
 * 
 * To reject unknown fields instead of stripping:
 *   Use z.object({...}).strict() in your schema definition
 */
import { NextResponse } from 'next/server';
import type { ZodSchema, ZodError } from 'zod';

/**
 * Standard validation error response shape.
 * 
 * {
 *   "error": "VALIDATION_ERROR",
 *   "message": "Invalid request body",
 *   "issues": [
 *     { "path": ["fieldName"], "code": "invalid_type", "message": "Expected string, received number" }
 *   ]
 * }
 */
export function validationError(zodError: ZodError): NextResponse {
    return NextResponse.json(
        {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            issues: zodError.issues.map((issue) => ({
                path: issue.path,
                code: issue.code,
                message: issue.message,
            })),
        },
        { status: 400 }
    );
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Unknown fields are stripped by default (.strip()).
 * 
 * Returns { data, error } — check `error` first.
 * If `error` is set, return it directly from the handler.
 */
export async function parseBody<T>(
    req: Request,
    schema: ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return {
            data: null,
            error: NextResponse.json(
                {
                    error: 'VALIDATION_ERROR',
                    message: 'Invalid JSON in request body',
                    issues: [],
                },
                { status: 400 }
            ),
        };
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
        return { data: null, error: validationError(result.error) };
    }

    return { data: result.data, error: null };
}
