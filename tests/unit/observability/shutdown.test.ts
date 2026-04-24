/**
 * Unit tests for installShutdownHandlers.
 *
 * Key assertions:
 *   - Idempotent: calling twice adds only one SIGTERM + one SIGINT listener.
 *   - SIGTERM triggers audit flush → OTel shutdown → Sentry shutdown in order.
 *   - A throwing audit flush does NOT prevent OTel + Sentry from running.
 *   - All three helpers are called exactly once per signal fire.
 */

jest.mock('@/app-layer/events/audit-stream', () => ({
    flushAllAuditStreams: jest.fn(),
}));
jest.mock('@/lib/observability/instrumentation', () => ({
    shutdownTelemetry: jest.fn(),
}));
jest.mock('@/lib/observability/sentry', () => ({
    shutdownSentry: jest.fn(),
}));
// Silence logger output in tests
jest.mock('@/lib/observability/logger', () => ({
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
    },
}));

import { flushAllAuditStreams } from '@/app-layer/events/audit-stream';
import { shutdownTelemetry } from '@/lib/observability/instrumentation';
import { shutdownSentry } from '@/lib/observability/sentry';
import {
    installShutdownHandlers,
    _resetShutdownInstalledForTesting,
} from '@/lib/observability/shutdown';

const mockFlush = flushAllAuditStreams as jest.MockedFunction<typeof flushAllAuditStreams>;
const mockOtel = shutdownTelemetry as jest.MockedFunction<typeof shutdownTelemetry>;
const mockSentry = shutdownSentry as jest.MockedFunction<typeof shutdownSentry>;

/** Let the microtask queue + any pending timers settle. */
async function settle(): Promise<void> {
    await new Promise<void>((r) => setImmediate(r));
}

afterEach(() => {
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    _resetShutdownInstalledForTesting();
    jest.clearAllMocks();
});

describe('installShutdownHandlers', () => {
    it('is idempotent — calling twice adds only one SIGTERM and one SIGINT listener', () => {
        const beforeTerm = process.listenerCount('SIGTERM');
        const beforeInt = process.listenerCount('SIGINT');

        installShutdownHandlers();
        installShutdownHandlers(); // second call should be a no-op

        expect(process.listenerCount('SIGTERM')).toBe(beforeTerm + 1);
        expect(process.listenerCount('SIGINT')).toBe(beforeInt + 1);
    });

    it('SIGTERM triggers audit flush, then OTel shutdown, then Sentry shutdown', async () => {
        const callOrder: string[] = [];
        mockFlush.mockImplementation(async () => { callOrder.push('audit'); });
        mockOtel.mockImplementation(async () => { callOrder.push('otel'); });
        mockSentry.mockImplementation(async () => { callOrder.push('sentry'); });

        installShutdownHandlers();
        process.emit('SIGTERM');
        await settle();

        expect(callOrder).toEqual(['audit', 'otel', 'sentry']);
    });

    it('calls each helper exactly once on SIGTERM', async () => {
        mockFlush.mockResolvedValue(undefined);
        mockOtel.mockResolvedValue(undefined);
        mockSentry.mockResolvedValue(undefined);

        installShutdownHandlers();
        process.emit('SIGTERM');
        await settle();

        expect(mockFlush).toHaveBeenCalledTimes(1);
        expect(mockOtel).toHaveBeenCalledTimes(1);
        expect(mockSentry).toHaveBeenCalledTimes(1);
    });

    it('OTel and Sentry still run when audit flush throws', async () => {
        mockFlush.mockRejectedValue(new Error('audit flush exploded'));
        mockOtel.mockResolvedValue(undefined);
        mockSentry.mockResolvedValue(undefined);

        installShutdownHandlers();
        process.emit('SIGTERM');
        await settle();

        // OTel and Sentry must still have been called despite the audit failure
        expect(mockOtel).toHaveBeenCalledTimes(1);
        expect(mockSentry).toHaveBeenCalledTimes(1);
    });
});
