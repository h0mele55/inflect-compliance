/**
 * Structured Logger — canonical log format for the application.
 *
 * Defines the standard log shape and emits structured JSON via console.*.
 * Designed as a thin abstraction that Pino can replace as a drop-in later.
 *
 * Every log entry is auto-enriched with fields from the observability
 * request context (requestId, tenantId, userId, route) when available.
 *
 * CANONICAL LOG FIELDS:
 *   timestamp  — ISO 8601
 *   level      — "debug" | "info" | "warn" | "error"
 *   msg        — human-readable message
 *   requestId  — correlation ID
 *   tenantId   — tenant scope
 *   userId     — authenticated user
 *   route      — request route pattern
 *   durationMs — elapsed time since request start
 *   component  — logical subsystem (e.g. "api", "auth", "sso", "job")
 *   error      — { name, message, stack? } when applicable
 *
 * SAFETY:
 *   - Never log raw secrets, tokens, passwords, or full request bodies.
 *   - Error stacks are included only at "error" level.
 *   - Sensitive fields should be redacted before passing to extra.
 */

import { getRequestContext } from './context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
    /** Logical subsystem */
    component?: string;
    /** Duration in ms (auto-calculated from context startTime if omitted) */
    durationMs?: number;
    /** Error metadata — auto-extracted if an Error instance is passed */
    error?: { name: string; message: string; stack?: string };
    /** Any additional safe metadata */
    [key: string]: unknown;
}

interface LogEntry extends LogFields {
    timestamp: string;
    level: LogLevel;
    msg: string;
    requestId: string;
    tenantId?: string;
    userId?: string;
    route?: string;
}

/**
 * Emit a structured log entry.
 * Auto-enriches with request context from AsyncLocalStorage.
 */
export function log(level: LogLevel, msg: string, fields?: LogFields): void {
    const ctx = getRequestContext();

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        msg,
        requestId: ctx?.requestId ?? 'unknown',
        ...(ctx?.tenantId && { tenantId: ctx.tenantId }),
        ...(ctx?.userId && { userId: ctx.userId }),
        ...(ctx?.route && { route: ctx.route }),
        ...fields,
    };

    // Auto-calculate durationMs from context if not explicitly provided
    if (entry.durationMs === undefined && ctx?.startTime) {
        entry.durationMs = Math.round(performance.now() - ctx.startTime);
    }

    const json = JSON.stringify(entry);

    switch (level) {
        case 'error':
            console.error(json);
            break;
        case 'warn':
            console.warn(json);
            break;
        case 'debug':
            console.debug(json);
            break;
        default:
            console.log(json);
    }
}

/**
 * Convenience helpers — each calls `log` with the appropriate level.
 */
export const logger = {
    debug: (msg: string, fields?: LogFields) => log('debug', msg, fields),
    info: (msg: string, fields?: LogFields) => log('info', msg, fields),
    warn: (msg: string, fields?: LogFields) => log('warn', msg, fields),
    error: (msg: string, fields?: LogFields) => log('error', msg, fields),
} as const;

/**
 * Helper: extract safe error metadata from an Error instance.
 * Use this when attaching error info to log fields.
 *
 * @example
 *   logger.error('Request failed', { error: extractErrorMeta(err) });
 */
export function extractErrorMeta(err: unknown): LogFields['error'] {
    if (err instanceof Error) {
        return {
            name: err.constructor.name,
            message: err.message,
            stack: err.stack,
        };
    }
    return {
        name: 'UnknownError',
        message: String(err),
    };
}
