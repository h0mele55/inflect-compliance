import { ZodError } from 'zod';
import { env } from '@/env';

/**
 * Standard API Error Response Shape
 * This ensures all API errors (4xx, 5xx) look the same to clients.
 */
export type ApiErrorResponse = {
    error: {
        code: string;          // e.g., "VALIDATION_ERROR", "UNAUTHORIZED", "INTERNAL", "NOT_FOUND"
        message: string;       // Safe, user-facing error message
        requestId?: string;    // Correlation ID for logs
        details?: unknown;     // Optional safe details (like Zod validation issues)
    };
};

/**
 * Custom AppError for internal throwing.
 * Use these to safely bubble up known errors to the `withApiErrorHandling` wrapper.
 */
export class AppError extends Error {
    public readonly code: string;
    public readonly status: number;
    public readonly expose: boolean;
    public readonly details?: unknown;

    constructor(
        message: string,
        code: string,
        status: number,
        expose: boolean = true,
        details?: unknown
    ) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.status = status;
        this.expose = expose;
        this.details = details;

        // Ensure accurate stack traces in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AppError);
        }
    }
}

// ── Shortcut Helpers for Common HTTP Errors ──

export const badRequest = (message: string, details?: unknown) =>
    new AppError(message, 'BAD_REQUEST', 400, true, details);

export const unauthorized = (message: string = 'Unauthorized') =>
    new AppError(message, 'UNAUTHORIZED', 401, true);

export const forbidden = (message: string = 'Forbidden') =>
    new AppError(message, 'FORBIDDEN', 403, true);

export const notFound = (message: string = 'Not Found') =>
    new AppError(message, 'NOT_FOUND', 404, true);

export const conflict = (message: string = 'Conflict') =>
    new AppError(message, 'CONFLICT', 409, true);

export const rateLimited = (message: string = 'Too many requests') =>
    new AppError(message, 'RATE_LIMITED', 429, true);

export const internal = (message: string = 'Internal Server Error') =>
    new AppError(message, 'INTERNAL', 500, false); // Expose = false to hide details safely

/**
 * Converts ANY thrown error into a safe ApiErrorResponse payload
 * and determines the correct HTTP status code.
 */
export function toApiErrorResponse(error: unknown, requestId?: string): { payload: ApiErrorResponse, status: number } {
    let payload: ApiErrorResponse = {
        error: {
            code: 'INTERNAL',
            message: 'An unexpected internal server error occurred',
            requestId
        }
    };
    let status = 500;

    if (error instanceof AppError) {
        status = error.status;
        payload.error.code = error.code;
        payload.error.message = error.expose ? error.message : 'An error occurred';
        if (error.details) payload.error.details = error.details;
    } else if (error instanceof ZodError) {
        status = 400;
        payload.error.code = 'VALIDATION_ERROR';
        payload.error.message = 'Invalid request payload';
        payload.error.details = error.issues.map(iss => ({
            path: iss.path,
            code: iss.code,
            message: iss.message
        }));
        // Prisma known error detection (without explicitly importing Prisma to keep Edge safe)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } else if (typeof error === 'object' && error !== null && 'code' in error && typeof (error as any).code === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prismaError = error as { code: string; meta?: any; message?: string };
        if (prismaError.code === 'P2002') {
            status = 409;
            payload.error.code = 'CONFLICT';
            payload.error.message = 'A resource with that unique constraint already exists';
            payload.error.details = prismaError.meta?.target;
        } else if (prismaError.code === 'P2025') {
            status = 404;
            payload.error.code = 'NOT_FOUND';
            payload.error.message = 'Resource not found or already deleted';
        }
    }

    // Never leak stack traces or raw messages for 500s unless in strict dev mode testing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (status === 500 && env.NODE_ENV === 'test' && error instanceof Error && (error as any).testExpose) {
        payload.error.details = error.message;
    }

    return { payload, status };
}
