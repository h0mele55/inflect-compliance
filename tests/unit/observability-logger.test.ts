/**
 * Unit tests for the structured observability logger.
 *
 * RUN: npx jest tests/unit/observability-logger.test.ts --verbose
 */

import {
    runWithRequestContext,
} from '@/lib/observability/context';
import {
    log,
    logger,
    extractErrorMeta,
} from '@/lib/observability/logger';

describe('Structured Logger — log()', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation();
        errorSpy = jest.spyOn(console, 'error').mockImplementation();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        debugSpy = jest.spyOn(console, 'debug').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('emits structured JSON with required fields', () => {
        log('info', 'hello world');
        expect(logSpy).toHaveBeenCalledTimes(1);

        const entry = JSON.parse(logSpy.mock.calls[0][0]);
        expect(entry.timestamp).toBeDefined();
        expect(entry.level).toBe('info');
        expect(entry.msg).toBe('hello world');
        expect(entry.requestId).toBe('unknown'); // no context active
    });

    it('auto-enriches from ALS context when available', () => {
        runWithRequestContext(
            { requestId: 'ctx-req-1', startTime: 0, route: '/api/controls', tenantId: 't-1', userId: 'u-1' },
            () => {
                log('info', 'enriched log');
            },
        );

        const entry = JSON.parse(logSpy.mock.calls[0][0]);
        expect(entry.requestId).toBe('ctx-req-1');
        expect(entry.tenantId).toBe('t-1');
        expect(entry.userId).toBe('u-1');
        expect(entry.route).toBe('/api/controls');
    });

    it('routes "error" level to console.error', () => {
        log('error', 'something broke');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('routes "warn" level to console.warn', () => {
        log('warn', 'heads up');
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('routes "debug" level to console.debug', () => {
        log('debug', 'detail');
        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('includes extra fields from the fields argument', () => {
        log('info', 'with extras', { component: 'auth', status: 401 });
        const entry = JSON.parse(logSpy.mock.calls[0][0]);
        expect(entry.component).toBe('auth');
        expect(entry.status).toBe(401);
    });

    it('omits undefined optional context fields (no tenantId/userId keys)', () => {
        runWithRequestContext(
            { requestId: 'clean', startTime: 0 },
            () => {
                log('info', 'clean log');
            },
        );

        const entry = JSON.parse(logSpy.mock.calls[0][0]);
        expect(entry.requestId).toBe('clean');
        expect(Object.keys(entry)).not.toContain('tenantId');
        expect(Object.keys(entry)).not.toContain('userId');
    });

    it('does not crash when no context is active', () => {
        expect(() => log('info', 'no context')).not.toThrow();
        expect(logSpy).toHaveBeenCalledTimes(1);
    });
});

describe('Structured Logger — logger convenience helpers', () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let warnSpy: jest.SpyInstance;
    let debugSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation();
        errorSpy = jest.spyOn(console, 'error').mockImplementation();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation();
        debugSpy = jest.spyOn(console, 'debug').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('logger.info emits info level', () => {
        logger.info('info msg');
        const entry = JSON.parse(logSpy.mock.calls[0][0]);
        expect(entry.level).toBe('info');
    });

    it('logger.error emits error level', () => {
        logger.error('error msg');
        const entry = JSON.parse(errorSpy.mock.calls[0][0]);
        expect(entry.level).toBe('error');
    });

    it('logger.warn emits warn level', () => {
        logger.warn('warn msg');
        const entry = JSON.parse(warnSpy.mock.calls[0][0]);
        expect(entry.level).toBe('warn');
    });

    it('logger.debug emits debug level', () => {
        logger.debug('debug msg');
        const entry = JSON.parse(debugSpy.mock.calls[0][0]);
        expect(entry.level).toBe('debug');
    });
});

describe('extractErrorMeta', () => {
    it('extracts name, message, and stack from an Error instance', () => {
        const err = new TypeError('bad type');
        const meta = extractErrorMeta(err);
        expect(meta?.name).toBe('TypeError');
        expect(meta?.message).toBe('bad type');
        expect(meta?.stack).toBeDefined();
    });

    it('handles non-Error values gracefully', () => {
        const meta = extractErrorMeta('string error');
        expect(meta?.name).toBe('UnknownError');
        expect(meta?.message).toBe('string error');
    });

    it('handles null/undefined gracefully', () => {
        const meta = extractErrorMeta(null);
        expect(meta?.name).toBe('UnknownError');
        expect(meta?.message).toBe('null');
    });
});
