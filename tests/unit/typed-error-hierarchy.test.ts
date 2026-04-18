/**
 * Typed Error Hierarchy Tests
 *
 * Verifies:
 * 1. Each typed subclass maps to the correct HTTP status and error code
 * 2. instanceof discrimination works for all subclasses
 * 3. Factory helpers return typed instances (backward compatibility)
 * 4. Domain-specific errors carry the correct domainCode
 * 5. toApiErrorResponse handles all subclasses correctly
 * 6. isAppError type guard works
 * 7. Error messages are safely exposed/hidden based on status
 */
import {
    AppError,
    ValidationError,
    NotFoundError,
    ForbiddenError,
    UnauthorizedError,
    ConflictError,
    RateLimitedError,
    InternalError,
    DomainError,
    isAppError,
    badRequest,
    notFound,
    forbidden,
    unauthorized,
    conflict,
    rateLimited,
    internal,
    tenantIsolationViolation,
    staleData,
    deprecatedResource,
    configurationError,
    externalServiceError,
    toApiErrorResponse,
} from '@/lib/errors/types';

describe('Typed Error Hierarchy', () => {
    // ─── Subclass instanceof discrimination ───

    describe('instanceof discrimination', () => {
        it('ValidationError is instanceof AppError and ValidationError', () => {
            const err = new ValidationError('bad input');
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(ValidationError);
            expect(err).toBeInstanceOf(Error);
        });

        it('NotFoundError is instanceof AppError and NotFoundError', () => {
            const err = new NotFoundError('missing');
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(NotFoundError);
        });

        it('ForbiddenError is instanceof AppError and ForbiddenError', () => {
            const err = new ForbiddenError('no access');
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(ForbiddenError);
        });

        it('UnauthorizedError is instanceof AppError and UnauthorizedError', () => {
            const err = new UnauthorizedError();
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(UnauthorizedError);
        });

        it('ConflictError is instanceof AppError and ConflictError', () => {
            const err = new ConflictError('dup');
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(ConflictError);
        });

        it('RateLimitedError is instanceof AppError and RateLimitedError', () => {
            const err = new RateLimitedError();
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(RateLimitedError);
        });

        it('InternalError is instanceof AppError and InternalError', () => {
            const err = new InternalError('db crash');
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(InternalError);
        });

        it('DomainError is instanceof AppError and DomainError', () => {
            const err = new DomainError('violation', 'TENANT_ISOLATION_VIOLATION', 403);
            expect(err).toBeInstanceOf(AppError);
            expect(err).toBeInstanceOf(DomainError);
        });

        it('different error types are distinguishable', () => {
            const v = new ValidationError('x');
            const n = new NotFoundError('y');
            expect(v).not.toBeInstanceOf(NotFoundError);
            expect(n).not.toBeInstanceOf(ValidationError);
        });
    });

    // ─── Status and code mapping ───

    describe('status and code mapping', () => {
        const cases: Array<[string, AppError, number, string]> = [
            ['ValidationError', new ValidationError('bad'), 400, 'BAD_REQUEST'],
            ['NotFoundError', new NotFoundError('gone'), 404, 'NOT_FOUND'],
            ['ForbiddenError', new ForbiddenError('no'), 403, 'FORBIDDEN'],
            ['UnauthorizedError', new UnauthorizedError(), 401, 'UNAUTHORIZED'],
            ['ConflictError', new ConflictError('dup'), 409, 'CONFLICT'],
            ['RateLimitedError', new RateLimitedError(), 429, 'RATE_LIMITED'],
            ['InternalError', new InternalError('crash'), 500, 'INTERNAL'],
        ];

        it.each(cases)('%s maps to status %d and code %s', (_name, err, status, code) => {
            expect(err.status).toBe(status);
            expect(err.code).toBe(code);
        });

        it('4xx errors have expose=true', () => {
            expect(new ValidationError('x').expose).toBe(true);
            expect(new NotFoundError().expose).toBe(true);
            expect(new ForbiddenError().expose).toBe(true);
            expect(new UnauthorizedError().expose).toBe(true);
            expect(new ConflictError().expose).toBe(true);
            expect(new RateLimitedError().expose).toBe(true);
        });

        it('5xx InternalError has expose=false', () => {
            expect(new InternalError('db crash').expose).toBe(false);
        });
    });

    // ─── Factory helpers backward compatibility ───

    describe('factory helpers return typed subclass instances', () => {
        it('badRequest() returns ValidationError', () => {
            const err = badRequest('invalid email');
            expect(err).toBeInstanceOf(ValidationError);
            expect(err).toBeInstanceOf(AppError);
            expect(err.status).toBe(400);
            expect(err.code).toBe('BAD_REQUEST');
        });

        it('notFound() returns NotFoundError', () => {
            const err = notFound('User not found');
            expect(err).toBeInstanceOf(NotFoundError);
            expect(err.status).toBe(404);
        });

        it('forbidden() returns ForbiddenError', () => {
            const err = forbidden('No access');
            expect(err).toBeInstanceOf(ForbiddenError);
            expect(err.status).toBe(403);
        });

        it('unauthorized() returns UnauthorizedError', () => {
            const err = unauthorized();
            expect(err).toBeInstanceOf(UnauthorizedError);
            expect(err.status).toBe(401);
        });

        it('conflict() returns ConflictError', () => {
            const err = conflict('Already exists');
            expect(err).toBeInstanceOf(ConflictError);
            expect(err.status).toBe(409);
        });

        it('rateLimited() returns RateLimitedError', () => {
            const err = rateLimited();
            expect(err).toBeInstanceOf(RateLimitedError);
            expect(err.status).toBe(429);
        });

        it('internal() returns InternalError', () => {
            const err = internal('DB down');
            expect(err).toBeInstanceOf(InternalError);
            expect(err.status).toBe(500);
            expect(err.expose).toBe(false);
        });

        it('badRequest with details preserves them', () => {
            const err = badRequest('Validation failed', { field: 'email' });
            expect(err.details).toEqual({ field: 'email' });
        });
    });

    // ─── Domain-specific errors ───

    describe('domain-specific errors', () => {
        it('tenantIsolationViolation maps to 403 with correct domainCode', () => {
            const err = tenantIsolationViolation('Cross-tenant access');
            expect(err).toBeInstanceOf(DomainError);
            expect(err).toBeInstanceOf(AppError);
            expect(err.domainCode).toBe('TENANT_ISOLATION_VIOLATION');
            expect(err.status).toBe(403);
            expect(err.code).toBe('TENANT_ISOLATION_VIOLATION');
        });

        it('staleData maps to 409 with STALE_DATA code', () => {
            const err = staleData();
            expect(err).toBeInstanceOf(DomainError);
            expect(err.status).toBe(409);
            expect(err.domainCode).toBe('STALE_DATA');
        });

        it('deprecatedResource maps to 410 with DEPRECATED_RESOURCE code', () => {
            const err = deprecatedResource('Old API');
            expect(err).toBeInstanceOf(DomainError);
            expect(err.status).toBe(410);
            expect(err.domainCode).toBe('DEPRECATED_RESOURCE');
        });

        it('configurationError maps to 500 with expose=false', () => {
            const err = configurationError('Missing env var');
            expect(err).toBeInstanceOf(DomainError);
            expect(err.status).toBe(500);
            expect(err.expose).toBe(false);
        });

        it('externalServiceError maps to 502 with expose=false', () => {
            const err = externalServiceError('GitHub down');
            expect(err).toBeInstanceOf(DomainError);
            expect(err.status).toBe(502);
            expect(err.expose).toBe(false);
        });
    });

    // ─── isAppError type guard ───

    describe('isAppError type guard', () => {
        it('returns true for AppError', () => {
            expect(isAppError(new AppError('x', 'X', 400))).toBe(true);
        });

        it('returns true for subclasses', () => {
            expect(isAppError(new ValidationError('x'))).toBe(true);
            expect(isAppError(new NotFoundError())).toBe(true);
            expect(isAppError(new DomainError('x', 'STALE_DATA'))).toBe(true);
        });

        it('returns false for plain Error', () => {
            expect(isAppError(new Error('x'))).toBe(false);
        });

        it('returns false for non-error values', () => {
            expect(isAppError('string')).toBe(false);
            expect(isAppError(null)).toBe(false);
            expect(isAppError(undefined)).toBe(false);
            expect(isAppError(42)).toBe(false);
        });
    });

    // ─── toApiErrorResponse with subclasses ───

    describe('toApiErrorResponse with typed subclasses', () => {
        it('maps ValidationError to 400 response', () => {
            const { payload, status } = toApiErrorResponse(badRequest('Bad email', { field: 'email' }), 'req-1');
            expect(status).toBe(400);
            expect(payload.error.code).toBe('BAD_REQUEST');
            expect(payload.error.message).toBe('Bad email');
            expect(payload.error.details).toEqual({ field: 'email' });
            expect(payload.error.requestId).toBe('req-1');
        });

        it('maps NotFoundError to 404 response', () => {
            const { payload, status } = toApiErrorResponse(notFound('User'), 'req-2');
            expect(status).toBe(404);
            expect(payload.error.code).toBe('NOT_FOUND');
            expect(payload.error.message).toBe('User');
        });

        it('maps InternalError suppressing message', () => {
            const { payload, status } = toApiErrorResponse(internal('DB connection failed'), 'req-3');
            expect(status).toBe(500);
            expect(payload.error.code).toBe('INTERNAL');
            expect(payload.error.message).toBe('An error occurred');
            expect(payload.error.message).not.toContain('DB');
        });

        it('maps DomainError preserving domainCode as error.code', () => {
            const { payload, status } = toApiErrorResponse(
                tenantIsolationViolation('Cross-tenant access blocked'),
                'req-4',
            );
            expect(status).toBe(403);
            expect(payload.error.code).toBe('TENANT_ISOLATION_VIOLATION');
            expect(payload.error.message).toBe('Cross-tenant access blocked');
        });

        it('maps deprecatedResource to 410 with expose=true (4xx)', () => {
            const { payload, status } = toApiErrorResponse(
                deprecatedResource('Endpoint removed'),
                'req-5',
            );
            expect(status).toBe(410);
            expect(payload.error.code).toBe('DEPRECATED_RESOURCE');
            expect(payload.error.message).toBe('Endpoint removed');
        });

        it('hides message for 5xx DomainErrors', () => {
            const { payload, status } = toApiErrorResponse(
                configurationError('STRIPE_SECRET_KEY missing'),
                'req-6',
            );
            expect(status).toBe(500);
            expect(payload.error.message).toBe('An error occurred');
            expect(payload.error.message).not.toContain('STRIPE');
        });
    });

    // ─── Error .name property ───

    describe('error .name property', () => {
        it.each([
            ['ValidationError', new ValidationError('x')],
            ['NotFoundError', new NotFoundError()],
            ['ForbiddenError', new ForbiddenError()],
            ['UnauthorizedError', new UnauthorizedError()],
            ['ConflictError', new ConflictError()],
            ['RateLimitedError', new RateLimitedError()],
            ['InternalError', new InternalError()],
            ['DomainError', new DomainError('x', 'STALE_DATA')],
        ] as const)('%s has correct .name', (expected, err) => {
            expect(err.name).toBe(expected);
        });
    });
});
