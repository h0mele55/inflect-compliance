/**
 * Request Metrics — OpenTelemetry counters and histograms.
 *
 * Provides basic API request metrics:
 *   - api.request.count    — Counter (method, route, status)
 *   - api.request.duration — Histogram in ms (method, route, status)
 *   - api.request.errors   — Counter (method, route, errorCode)
 *
 * These are recorded from `withApiErrorHandling` at request completion.
 * When OTel is not initialized, the noop meter produces noop instruments
 * that accept calls without overhead.
 */

import { metrics } from '@opentelemetry/api';

const METER_NAME = 'inflect-compliance';

function getMeter() {
    return metrics.getMeter(METER_NAME);
}

// ── Lazy instrument singletons ──
// Created on first access so the global meter provider has time to register.

let _requestCount: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;
let _requestDuration: ReturnType<ReturnType<typeof getMeter>['createHistogram']> | null = null;
let _requestErrors: ReturnType<ReturnType<typeof getMeter>['createCounter']> | null = null;

function getRequestCount() {
    if (!_requestCount) {
        _requestCount = getMeter().createCounter('api.request.count', {
            description: 'Total number of API requests',
            unit: '1',
        });
    }
    return _requestCount;
}

function getRequestDuration() {
    if (!_requestDuration) {
        _requestDuration = getMeter().createHistogram('api.request.duration', {
            description: 'API request duration in milliseconds',
            unit: 'ms',
        });
    }
    return _requestDuration;
}

function getRequestErrors() {
    if (!_requestErrors) {
        _requestErrors = getMeter().createCounter('api.request.errors', {
            description: 'Total number of API request errors',
            unit: '1',
        });
    }
    return _requestErrors;
}

/**
 * Record a completed API request.
 */
export function recordRequestMetrics(attrs: {
    method: string;
    route: string;
    status: number;
    durationMs: number;
}): void {
    const labels = {
        'http.method': attrs.method,
        'http.route': attrs.route,
        'http.status_code': attrs.status,
    };

    getRequestCount().add(1, labels);
    getRequestDuration().record(attrs.durationMs, labels);
}

/**
 * Record an API request error.
 */
export function recordRequestError(attrs: {
    method: string;
    route: string;
    errorCode: string;
}): void {
    getRequestErrors().add(1, {
        'http.method': attrs.method,
        'http.route': attrs.route,
        'error.code': attrs.errorCode,
    });
}
