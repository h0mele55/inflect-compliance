/**
 * Email template builders for each EmailNotificationType.
 * Returns { subject, bodyText, bodyHtml } for each type.
 */

export interface EmailTemplateResult {
    subject: string;
    bodyText: string;
    bodyHtml: string;
}

// ─── Task Assigned ───

export interface TaskAssignedPayload {
    taskTitle: string;
    taskKey?: string | null;
    taskType: string;
    assigneeName: string;
    assignerName?: string;
    tenantSlug: string;
}

export function buildTaskAssignedEmail(payload: TaskAssignedPayload): EmailTemplateResult {
    const { taskTitle, taskKey, taskType, assigneeName, assignerName, tenantSlug } = payload;
    const keyLabel = taskKey ? `[${taskKey}] ` : '';
    const byLine = assignerName ? ` by ${assignerName}` : '';
    const link = `/t/${tenantSlug}/tasks`;

    return {
        subject: `Task assigned to you: ${keyLabel}${taskTitle}`,
        bodyText: [
            `Hi ${assigneeName},`,
            '',
            `You have been assigned a ${taskType.toLowerCase()} task${byLine}:`,
            '',
            `  ${keyLabel}${taskTitle}`,
            '',
            `View your tasks: ${link}`,
            '',
            '— Inflect Compliance',
        ].join('\n'),
        bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a2e; font-size: 18px; margin-bottom: 16px;">Task assigned to you</h2>
  <p style="color: #444; line-height: 1.5;">Hi ${escapeHtml(assigneeName)},</p>
  <p style="color: #444; line-height: 1.5;">You have been assigned a <strong>${escapeHtml(taskType.toLowerCase())}</strong> task${byLine ? ` by <strong>${escapeHtml(assignerName!)}</strong>` : ''}:</p>
  <div style="background: #f4f6fa; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <strong>${escapeHtml(keyLabel)}${escapeHtml(taskTitle)}</strong>
  </div>
  <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">View Tasks</a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">— Inflect Compliance</p>
</div>`.trim(),
    };
}

// ─── Evidence Expiring ───

export interface EvidenceExpiringPayload {
    evidenceTitle: string;
    daysRemaining: number;
    retentionUntil: string;
    controlName?: string | null;
    recipientName: string;
    tenantSlug: string;
}

export function buildEvidenceExpiringEmail(payload: EvidenceExpiringPayload): EmailTemplateResult {
    const { evidenceTitle, daysRemaining, retentionUntil, controlName, recipientName, tenantSlug } = payload;
    const urgency = daysRemaining <= 7 ? '⚠️ ' : '';
    const link = `/t/${tenantSlug}/evidence`;

    return {
        subject: `${urgency}Evidence expiring in ${daysRemaining} day(s): ${evidenceTitle}`,
        bodyText: [
            `Hi ${recipientName},`,
            '',
            `Evidence "${evidenceTitle}" is expiring in ${daysRemaining} day(s) (${retentionUntil}).`,
            ...(controlName ? [`Control: ${controlName}`] : []),
            '',
            'Please upload refreshed evidence or extend the retention date.',
            '',
            `View evidence: ${link}`,
            '',
            '— Inflect Compliance',
        ].join('\n'),
        bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a2e; font-size: 18px; margin-bottom: 16px;">${urgency}Evidence expiring soon</h2>
  <p style="color: #444; line-height: 1.5;">Hi ${escapeHtml(recipientName)},</p>
  <p style="color: #444; line-height: 1.5;">Evidence <strong>"${escapeHtml(evidenceTitle)}"</strong> is expiring in <strong>${daysRemaining} day(s)</strong> (${escapeHtml(retentionUntil)}).</p>
  ${controlName ? `<p style="color: #666; line-height: 1.5;">Control: <strong>${escapeHtml(controlName)}</strong></p>` : ''}
  <p style="color: #444; line-height: 1.5;">Please upload refreshed evidence or extend the retention date.</p>
  <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">View Evidence</a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">— Inflect Compliance</p>
</div>`.trim(),
    };
}

// ─── Policy Approval Requested ───

export interface PolicyApprovalRequestedPayload {
    policyTitle: string;
    requesterName: string;
    approverName: string;
    versionNumber?: number;
    tenantSlug: string;
}

export function buildPolicyApprovalRequestedEmail(payload: PolicyApprovalRequestedPayload): EmailTemplateResult {
    const { policyTitle, requesterName, approverName, versionNumber, tenantSlug } = payload;
    const versionLabel = versionNumber ? ` (v${versionNumber})` : '';
    const link = `/t/${tenantSlug}/policies`;

    return {
        subject: `Policy approval requested: ${policyTitle}${versionLabel}`,
        bodyText: [
            `Hi ${approverName},`,
            '',
            `${requesterName} has requested your approval for:`,
            '',
            `  ${policyTitle}${versionLabel}`,
            '',
            `Please review and approve or reject the policy.`,
            '',
            `View policies: ${link}`,
            '',
            '— Inflect Compliance',
        ].join('\n'),
        bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a2e; font-size: 18px; margin-bottom: 16px;">Policy approval requested</h2>
  <p style="color: #444; line-height: 1.5;">Hi ${escapeHtml(approverName)},</p>
  <p style="color: #444; line-height: 1.5;"><strong>${escapeHtml(requesterName)}</strong> has requested your approval for:</p>
  <div style="background: #f4f6fa; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
    <strong>${escapeHtml(policyTitle)}${escapeHtml(versionLabel)}</strong>
  </div>
  <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Review Policy</a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">— Inflect Compliance</p>
</div>`.trim(),
    };
}

// ─── Policy Approved / Rejected ───

export interface PolicyDecisionPayload {
    policyTitle: string;
    decision: 'APPROVED' | 'REJECTED';
    deciderName: string;
    requesterName: string;
    comment?: string | null;
    tenantSlug: string;
}

export function buildPolicyDecisionEmail(payload: PolicyDecisionPayload): EmailTemplateResult {
    const { policyTitle, decision, deciderName, requesterName, comment, tenantSlug } = payload;
    const isApproved = decision === 'APPROVED';
    const emoji = isApproved ? '✅' : '❌';
    const word = isApproved ? 'approved' : 'rejected';
    const link = `/t/${tenantSlug}/policies`;

    return {
        subject: `${emoji} Policy ${word}: ${policyTitle}`,
        bodyText: [
            `Hi ${requesterName},`,
            '',
            `Your policy "${policyTitle}" has been ${word} by ${deciderName}.`,
            ...(comment ? [``, `Comment: ${comment}`] : []),
            '',
            `View policies: ${link}`,
            '',
            '— Inflect Compliance',
        ].join('\n'),
        bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a2e; font-size: 18px; margin-bottom: 16px;">${emoji} Policy ${word}</h2>
  <p style="color: #444; line-height: 1.5;">Hi ${escapeHtml(requesterName)},</p>
  <p style="color: #444; line-height: 1.5;">Your policy <strong>"${escapeHtml(policyTitle)}"</strong> has been <strong>${word}</strong> by ${escapeHtml(deciderName)}.</p>
  ${comment ? `<div style="background: #f4f6fa; border-left: 4px solid ${isApproved ? '#10b981' : '#ef4444'}; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><em>${escapeHtml(comment)}</em></div>` : ''}
  <a href="${link}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">View Policies</a>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">— Inflect Compliance</p>
</div>`.trim(),
    };
}

// ─── Vendor assessment invitation (Epic G-3) ───

export interface VendorAssessmentInvitationPayload {
    /// Vendor / org name to address — falls back to "Vendor team".
    recipientName: string;
    /// Free-text vendor name shown in the body.
    vendorName: string;
    /// Template name for context.
    templateName: string;
    /// The full external response URL — INCLUDES the raw token.
    /// This is the only place the raw token ever appears, so the
    /// caller is responsible for ensuring it's transmitted only via
    /// the email body and never logged elsewhere.
    responseUrl: string;
    /// ISO timestamp the link expires (formatted in the body).
    expiresAtIso: string;
    /// Optional inviter name for the by-line.
    inviterName?: string;
}

export function buildVendorAssessmentInvitationEmail(
    payload: VendorAssessmentInvitationPayload,
): EmailTemplateResult {
    const {
        recipientName,
        vendorName,
        templateName,
        responseUrl,
        expiresAtIso,
        inviterName,
    } = payload;
    const expiresFormatted = formatIsoDate(expiresAtIso);
    const byLine = inviterName ? ` from ${inviterName}` : '';

    return {
        subject: `Action required: ${templateName} questionnaire`,
        bodyText: [
            `Hi ${recipientName},`,
            '',
            `You've received a vendor assessment questionnaire${byLine}.`,
            '',
            `  Vendor:    ${vendorName}`,
            `  Template:  ${templateName}`,
            `  Expires:   ${expiresFormatted}`,
            '',
            `Open the questionnaire: ${responseUrl}`,
            '',
            'This link is single-use and tied to your assessment. Please do',
            'not forward it.',
            '',
            '— Inflect Compliance',
        ].join('\n'),
        bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1a1a2e; font-size: 18px; margin-bottom: 16px;">📋 Vendor assessment requested</h2>
  <p style="color: #444; line-height: 1.5;">Hi ${escapeHtml(recipientName)},</p>
  <p style="color: #444; line-height: 1.5;">You've received a vendor assessment questionnaire${byLine ? ` from <strong>${escapeHtml(inviterName!)}</strong>` : ''}.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="color: #888; padding: 4px 0; width: 100px;">Vendor</td><td style="color: #444;"><strong>${escapeHtml(vendorName)}</strong></td></tr>
    <tr><td style="color: #888; padding: 4px 0;">Template</td><td style="color: #444;">${escapeHtml(templateName)}</td></tr>
    <tr><td style="color: #888; padding: 4px 0;">Expires</td><td style="color: #444;">${escapeHtml(expiresFormatted)}</td></tr>
  </table>
  <a href="${escapeHtml(responseUrl)}" style="display: inline-block; background: #4f46e5; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">Open questionnaire</a>
  <p style="color: #888; font-size: 12px; line-height: 1.5; margin-top: 16px;">This link is single-use and tied to your assessment. Please do not forward it.</p>
  <p style="color: #999; font-size: 12px; margin-top: 24px;">— Inflect Compliance</p>
</div>`.trim(),
    };
}

// ─── Helpers ───

function formatIsoDate(iso: string): string {
    try {
        return new Date(iso).toUTCString();
    } catch {
        return iso;
    }
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
