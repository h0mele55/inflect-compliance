# Observability Guide

## Overview

inflect-compliance uses three observability layers:

| Layer | Technology | Purpose |
|---|---|---|
| **Structured Logging** | Pino | Machine-readable JSON logs with requestId |
| **Distributed Tracing** | OpenTelemetry | Spans for request flows and business operations |
| **Error Reporting** | Sentry | 5xx error capture with safe metadata |

All three are **safe by default** — they do nothing when their environment variables are not set. The application works identically with or without observability enabled.

---

## RequestId Model

Every API request and background job gets a unique identifier:

- **API requests**: `requestId` set in `withApiErrorHandling`, stored in AsyncLocalStorage (ALS)
- **Background jobs**: `jobRunId` set by `runJob()`, stored in ALS as `requestId`

The ID propagates automatically to:
- All Pino log lines (`requestId` field)
- OTel span attributes (`request.id`)
- Sentry error tags (`requestId`)

**No manual propagation needed.** Any code running within the request/job context automatically inherits the ID via AsyncLocalStorage.

---

## Log Field Schema

All logs produced by the structured logger include:

| Field | Source | Always Present |
|---|---|---|
| `level` | Pino | ✅ |
| `time` | Pino | ✅ |
| `msg` | Developer | ✅ |
| `requestId` | ALS auto-enrich | ✅ (in request/job context) |
| `tenantId` | ALS auto-enrich | When available |
| `component` | Developer | ✅ Convention |
| `route` | ALS auto-enrich | ✅ (in request context) |

### Component Convention

| Value | Meaning |
|---|---|
| `api` | Route handler lifecycle (start/end/error) |
| `sso` | SSO identity linking, config, enforcement |
| `mfa` | MFA challenge verification |
| `onboarding` | Onboarding wizard lifecycle |
| `report` | Report generation |
| `file` | File download |
| `job` | Background job execution |

### Redacted Fields

Pino is configured to redact these paths in log objects:

```
authorization, cookie, password, secret, token, mfaCode,
clientSecret, accessToken, refreshToken, idToken, privateKey, totpSecret
```

---

## Tracing Setup

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OTEL_ENABLED` | `false` | Master switch — must be `true` to activate |
| `OTEL_SERVICE_NAME` | `inflect-compliance` | Service name in traces |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP HTTP endpoint |

### How It Works

1. `src/instrumentation.ts` — Next.js `register()` hook calls `initTelemetry()` on server startup
2. `initTelemetry()` creates a `NodeTracerProvider` with `BatchSpanProcessor` → OTLP HTTP exporter
3. `withApiErrorHandling` creates a root span for every API request
4. `traceUsecase(name, ctx, fn)` creates child spans for business operations
5. `traceOperation(name, attrs, fn)` creates spans for generic operations

### Backend Compatibility

OTLP HTTP export works with: **Jaeger**, **Grafana Tempo**, **Datadog**, **Honeycomb**, **Elastic APM**, **AWS X-Ray (via collector)**.

### Local Development

```bash
# Run Jaeger all-in-one for local trace viewing:
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Enable tracing:
OTEL_ENABLED=true npm run dev

# View traces at http://localhost:16686
```

---

## Error Reporting Setup

### Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `SENTRY_DSN` | — | Sentry project DSN (noop if missing) |
| `SENTRY_ENVIRONMENT` | `NODE_ENV` | Environment tag |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` | Performance monitoring (0 = rely on OTel) |

### What Gets Captured

- **Only 5xx errors** — all 4xx errors are intentionally skipped
- **Server-side**: Captured in `withApiErrorHandling` catch block
- **Client-side**: Captured in `error.tsx` and `global-error.tsx` error boundaries

### What Gets Redacted (beforeSend)

- Authorization headers → `[Filtered]`
- Cookie headers → `[Filtered]`
- Request bodies → `[Filtered]`
- URL query strings → `[Filtered]`
- Sensitive URL parameters (token, secret, password, key, code, session) → `[Redacted]`

### Ignored Errors

- `NEXT_REDIRECT` / `NEXT_NOT_FOUND` — Next.js navigation signals
- `DYNAMIC_SERVER_USAGE` — Next.js build artifact
- `ResizeObserver loop` — Browser noise

---

## Local / Dev vs Production

| Aspect | Development | Production |
|---|---|---|
| **Log format** | Pretty-printed (pino-pretty) | JSON |
| **Log level** | `debug` | `info` (via `LOG_LEVEL`) |
| **OTel** | Off unless `OTEL_ENABLED=true` | On with collector endpoint |
| **Sentry** | Off unless `SENTRY_DSN` set | On with project DSN |
| **Email** | Console sink | Real mailer |

---

## Diagnostics Endpoint

`GET /api/admin/diagnostics` — admin-only, returns:

```json
{
  "service": { "name": "…", "version": "…", "environment": "…", "uptimeSeconds": 42 },
  "observability": { "otelEnabled": true, "sentryConfigured": true, "logLevel": "info" },
  "runtime": { "nodeVersion": "v20.x", "memoryUsageMB": 128 }
}
```

---

## Maintenance Guide

### Adding observability to a new usecase

```typescript
import { logger } from '@/lib/observability/logger';
import { traceUsecase } from '@/lib/observability/tracing';

export async function myNewUsecase(ctx: RequestContext) {
    logger.info('my operation started', { component: 'my-module' });

    return traceUsecase('my-module.operation', ctx, async () => {
        // ... business logic ...
        logger.info('my operation completed', { component: 'my-module', resultCount: 42 });
        return result;
    });
}
```

### Adding observability to a new background job

```typescript
import { runJob } from '@/lib/observability/job-runner';
import { logger } from '@/lib/observability/logger';

export async function myNewJob() {
    return runJob('my-job-name', async () => {
        logger.info('processing items', { component: 'job', count: 100 });
        // ... job logic ...
        return { processed: 100 };
    });
}
```

### Console.log Policy

- **Forbidden** in `src/app-layer/` and `src/app/api/` — use `logger.*` instead
- **Allowed** in infrastructure modules (`src/lib/`) with allowlist (mailer dev sink, rate-limit, CSP, Prisma audit middleware)
- **Enforced** by regression guard test: `observability-guards.test.ts`
