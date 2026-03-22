/**
 * OpenTelemetry SDK Bootstrap — initializes tracing and metrics.
 *
 * GUARDED: Does nothing unless `OTEL_ENABLED=true` env var is set.
 * This ensures zero overhead in dev/test when no collector is running.
 *
 * ENV VARS:
 *   OTEL_ENABLED               — "true" to activate (default: off)
 *   OTEL_SERVICE_NAME           — service resource name (default: "inflect-compliance")
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP HTTP endpoint (default: "http://localhost:4318")
 *
 * USAGE:
 *   Called from `src/instrumentation.ts` (Next.js register hook).
 */

import { DiagConsoleLogger, DiagLogLevel, diag } from '@opentelemetry/api';

let _initialized = false;

/**
 * Initialize OpenTelemetry SDK (traces + metrics).
 * Safe to call multiple times — only initializes once.
 */
export async function initTelemetry(): Promise<void> {
    if (_initialized) return;

    const enabled = process.env.OTEL_ENABLED === 'true';
    if (!enabled) {
        _initialized = true;
        return;
    }

    // Optional: enable OTel diagnostic logging for debugging
    if (process.env.OTEL_DEBUG === 'true') {
        diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
    }

    const serviceName = process.env.OTEL_SERVICE_NAME || 'inflect-compliance';
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

    // Dynamic imports to avoid loading heavy modules when OTel is disabled
    const resourcesMod = await import('@opentelemetry/resources');
    const Resource = resourcesMod.Resource ?? (resourcesMod as /* eslint-disable-line */ any).default?.Resource;
    const semConvMod = await import('@opentelemetry/semantic-conventions');
    const ATTR_SERVICE_NAME = semConvMod.ATTR_SERVICE_NAME ?? 'service.name';
    const ATTR_SERVICE_VERSION = semConvMod.ATTR_SERVICE_VERSION ?? 'service.version';
    const { NodeTracerProvider, BatchSpanProcessor } = await import('@opentelemetry/sdk-trace-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { MeterProvider, PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');

    const resource = new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
        'deployment.environment': process.env.NODE_ENV || 'development',
    });

    // ── Traces ──
    const traceExporter = new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
    });

    const tracerProvider = new NodeTracerProvider({
        resource,
        spanProcessors: [new BatchSpanProcessor(traceExporter)],
    });
    tracerProvider.register();

    // ── Metrics ──
    const metricExporter = new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`,
    });

    const meterProvider = new MeterProvider({
        resource,
        readers: [
            new PeriodicExportingMetricReader({
                exporter: metricExporter,
                exportIntervalMillis: 30_000, // flush every 30s
            }),
        ],
    });

    // Register the meter provider globally
    const { metrics } = await import('@opentelemetry/api');
    metrics.setGlobalMeterProvider(meterProvider);

    _initialized = true;
    console.log(`[otel] Telemetry initialized — service=${serviceName} endpoint=${otlpEndpoint}`);
}

/** Check if OTel has been initialized (useful for tests). */
export function isTelemetryInitialized(): boolean {
    return _initialized;
}

/**
 * Reset initialization flag (for testing only).
 * @internal
 */
export function _resetForTesting(): void {
    _initialized = false;
}
