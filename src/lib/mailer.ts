/**
 * Email provider abstraction. Dev mode: logs to console.
 * In production, swap the transport for a real SMTP/SES/SendGrid provider.
 */

interface EmailMessage {
    to: string;
    subject: string;
    html: string;
}

interface EmailProvider {
    send(msg: EmailMessage): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
    async send(msg: EmailMessage): Promise<void> {
        console.log('═══════════════════════════════════════');
        console.log('📧 EMAIL (dev console sink)');
        console.log(`  To: ${msg.to}`);
        console.log(`  Subject: ${msg.subject}`);
        console.log(`  Body: ${msg.html.substring(0, 200)}...`);
        console.log('═══════════════════════════════════════');
    }
}

// Singleton provider — swap to NodemailerProvider, SESProvider, etc.
let provider: EmailProvider = new ConsoleEmailProvider();

export function setEmailProvider(p: EmailProvider) {
    provider = p;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
    await provider.send(msg);
}

export type { EmailMessage, EmailProvider };
