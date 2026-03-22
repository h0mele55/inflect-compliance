/**
 * Observability — barrel export.
 *
 * Public API:
 *   Context: runWithRequestContext, getRequestContext, getRequestId, mergeRequestContext
 *   Logger:  logger, log, extractErrorMeta, createChildLogger, pinoInstance
 */

export {
    runWithRequestContext,
    getRequestContext,
    getRequestId,
    mergeRequestContext,
} from './context';
export type { RequestContextData } from './context';

export {
    logger,
    log,
    extractErrorMeta,
    createChildLogger,
    pinoInstance,
} from './logger';
export type { LogLevel, LogFields } from './logger';
