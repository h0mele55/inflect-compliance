/**
 * Unit tests for the outbox processor and stub transport.
 */
import { StubEmailProvider, setEmailProvider, sendEmail } from '@/lib/mailer';

describe('StubEmailProvider', () => {
    it('records sent messages', async () => {
        const stub = new StubEmailProvider();
        setEmailProvider(stub);

        await sendEmail({
            to: 'alice@acme.com',
            subject: 'Test subject',
            text: 'Test body',
            html: '<p>Test body</p>',
        });

        expect(stub.sentMessages).toHaveLength(1);
        expect(stub.sentMessages[0]).toEqual({
            to: 'alice@acme.com',
            subject: 'Test subject',
            text: 'Test body',
            html: '<p>Test body</p>',
        });
    });

    it('accumulates multiple messages', async () => {
        const stub = new StubEmailProvider();
        setEmailProvider(stub);

        await sendEmail({ to: 'a@b.com', subject: 'S1', text: 'B1' });
        await sendEmail({ to: 'c@d.com', subject: 'S2', text: 'B2' });

        expect(stub.sentMessages).toHaveLength(2);
    });

    it('reset() clears messages', async () => {
        const stub = new StubEmailProvider();
        setEmailProvider(stub);

        await sendEmail({ to: 'a@b.com', subject: 'S', text: 'B' });
        expect(stub.sentMessages).toHaveLength(1);

        stub.reset();
        expect(stub.sentMessages).toHaveLength(0);
    });

    it('never sends to real SMTP', async () => {
        const stub = new StubEmailProvider();
        setEmailProvider(stub);

        // This should NOT throw or make any network call
        await sendEmail({ to: 'real@example.com', subject: 'Real', text: 'Body' });
        expect(stub.sentMessages).toHaveLength(1);
    });
});
