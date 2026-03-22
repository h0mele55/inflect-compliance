/**
 * Observability — barrel export.
 *
 * Public API:
 *   Context:  runWithRequestContext, getRequestContext, getRequestId, mergeRequestContext
 *   Logger:   logger, log, extractErrorMeta, createChildLogger, pinoInstance
 *   Tracing:  getTracer, traceUsecase, traceOperation
 *   Metrics:  recordRequestMetrics, recordRequestError
 *   Bootstrap: initTelemetry, isTelemetryInitialized
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

export {
    getTracer,
    traceUsecase,
    traceOperation,
} from './tracing';

export {
    recordRequestMetrics,
    recordRequestError,
} from './metrics';

export {
    initTelemetry,
    isTelemetryInitialized,
} from './instrumentation';
