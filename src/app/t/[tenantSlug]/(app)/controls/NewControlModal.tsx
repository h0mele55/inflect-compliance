'use client';

/**
 * Epic 54 — Create Control modal.
 *
 * Modal-based version of the legacy `/controls/new` full-page form. Mounts
 * inside the Controls list so users don't lose their table state, filters,
 * or scroll position when opening "New Control".
 *
 * Business behaviour is unchanged:
 *   - POST /api/t/:slug/controls with the same payload.
 *   - Optional NOT_APPLICABLE applicability update on the created control.
 *   - On success, invalidate the Controls React-Query cache and navigate to
 *     the new control's detail page (preserves the existing downstream E2E
 *     state that chains through controlDetailPath).
 *   - Form IDs (#control-name-input, #control-code-input, …,
 *     #create-control-btn) are preserved so existing E2E suites pass
 *     untouched against the modal.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { Modal } from '@/components/ui/modal';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InfoTooltip } from '@/components/ui/tooltip';
import { queryKeys } from '@/lib/queryKeys';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';
import { useFormTelemetry } from '@/lib/telemetry/form-telemetry';

const FREQUENCY_OPTIONS: ComboboxOption[] = [
    { value: 'AD_HOC', label: 'Ad Hoc' },
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'ANNUALLY', label: 'Annually' },
];

const CATEGORY_OPTIONS: ComboboxOption[] = [
    { value: 'Access Control', label: 'Access Control' },
    { value: 'Encryption', label: 'Encryption' },
    { value: 'Network Security', label: 'Network Security' },
    { value: 'Physical Security', label: 'Physical Security' },
    { value: 'HR Security', label: 'HR Security' },
    { value: 'Operations', label: 'Operations' },
    { value: 'Compliance', label: 'Compliance' },
    { value: 'Incident Management', label: 'Incident Management' },
    { value: 'Business Continuity', label: 'Business Continuity' },
    { value: 'Other', label: 'Other' },
];

export interface NewControlModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    /**
     * Tenant slug for the react-query invalidation. The mutation uses the
     * tenant-scoped apiUrl helper already, so this is only used for cache
     * keys.
     */
    tenantSlug: string;
}

export function NewControlModal({ open, setOpen, tenantSlug }: NewControlModalProps) {
    // Normalise the setState-compatible setter into a simple close helper
    // so the form handlers don't need to branch on function-vs-value.
    const close = useCallback(() => setOpen(false), [setOpen]);
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();
    const queryClient = useQueryClient();

    const [form, setForm] = useState({
        code: '',
        name: '',
        description: '',
        category: '',
        frequency: '',
    });
    const [applicability, setApplicability] = useState<'APPLICABLE' | 'NOT_APPLICABLE'>(
        'APPLICABLE',
    );
    const [justification, setJustification] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const nameInputRef = useRef<HTMLInputElement>(null);

    // Reset the form + focus the name input each time the modal opens.
    useEffect(() => {
        if (!open) return;
        setForm({ code: '', name: '', description: '', category: '', frequency: '' });
        setApplicability('APPLICABLE');
        setJustification('');
        setError('');
        setSaving(false);
        // Give Radix's focus manager a beat before we override — matches
        // the preventDefault on onOpenAutoFocus in <Modal>.
        const t = setTimeout(() => nameInputRef.current?.focus(), 60);
        return () => clearTimeout(t);
    }, [open]);

    const update = (field: keyof typeof form, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const canSubmit = form.name.trim().length > 0 && !saving &&
        (applicability === 'APPLICABLE' || justification.trim().length > 0);

    const telemetry = useFormTelemetry('NewControlModal');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        setError('');
        telemetry.trackSubmit({
            applicability,
            hasCategory: Boolean(form.category),
            hasFrequency: Boolean(form.frequency),
        });
        try {
            const body = {
                name: form.name.trim(),
                code: form.code.trim() || undefined,
                description: form.description.trim() || undefined,
                category: form.category || undefined,
                frequency: form.frequency || undefined,
                isCustom: true,
            };

            const res = await fetch(apiUrl('/controls'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg =
                    typeof data.error === 'string'
                        ? data.error
                        : data.message || 'Failed to create control';
                throw new Error(msg);
            }
            const control = await res.json();

            if (applicability === 'NOT_APPLICABLE' && justification.trim()) {
                await fetch(apiUrl(`/controls/${control.id}/applicability`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        applicability: 'NOT_APPLICABLE',
                        justification,
                    }),
                });
            }

            // Refresh the list in the background so when the user returns
            // the new control is already there.
            queryClient.invalidateQueries({
                queryKey: queryKeys.controls.all(tenantSlug),
            });

            telemetry.trackSuccess({ controlId: control.id });
            close();
            // Preserve the legacy post-create UX: deep-link to the new
            // control so users can start editing immediately.
            router.push(tenantHref(`/controls/${control.id}`));
        } catch (err) {
            telemetry.trackError(err);
            setError(err instanceof Error ? err.message : 'Failed to create control');
            setSaving(false);
        }
    };

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="lg"
            title="New control"
            description="Create a custom control for your register."
            preventDefaultClose={saving}
        >
            <Modal.Header
                title="New Control"
                description="Create a custom control for your register."
            />
            <Modal.Form onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="new-control-error"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <FormField label="Code">
                            <Input
                                id="control-code-input"
                                type="text"
                                placeholder="e.g. CTRL-001"
                                value={form.code}
                                onChange={(e) => update('code', e.target.value)}
                                autoComplete="off"
                            />
                        </FormField>
                        <FormField label="Name" required>
                            <Input
                                id="control-name-input"
                                ref={nameInputRef}
                                type="text"
                                placeholder="e.g. Password Policy Enforcement"
                                value={form.name}
                                onChange={(e) => update('name', e.target.value)}
                                required
                                autoComplete="off"
                            />
                        </FormField>
                        <FormField label="Description">
                            <Textarea
                                id="control-description-input"
                                rows={3}
                                placeholder="Brief description of this control"
                                value={form.description}
                                onChange={(e) => update('description', e.target.value)}
                            />
                        </FormField>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormField label="Category">
                                <Combobox
                                    id="control-category-input"
                                    name="category"
                                    options={CATEGORY_OPTIONS}
                                    selected={CATEGORY_OPTIONS.find(o => o.value === form.category) ?? null}
                                    setSelected={(o) => update('category', o?.value ?? '')}
                                    placeholder="Select category…"
                                    searchPlaceholder="Search categories…"
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: 'w-full' }}
                                    caret
                                />
                            </FormField>
                            <FormField
                                label="Frequency"
                                hint="How often the control is expected to be reviewed or re-tested (monthly, quarterly, annually). Drives the next-review date on the control dashboard."
                            >
                                <Combobox
                                    id="control-frequency-input"
                                    name="frequency"
                                    options={FREQUENCY_OPTIONS}
                                    selected={FREQUENCY_OPTIONS.find(o => o.value === form.frequency) ?? null}
                                    setSelected={(o) => update('frequency', o?.value ?? '')}
                                    placeholder="Select frequency…"
                                    hideSearch
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: 'w-full' }}
                                    caret
                                />
                            </FormField>
                        </div>
                        <div role="group" aria-labelledby="applicability-legend">
                            <div className="mb-1 flex items-center gap-1.5">
                                <span
                                    id="applicability-legend"
                                    className="text-sm text-content-default"
                                >
                                    Applicability
                                </span>
                                <InfoTooltip
                                    aria-label="About control applicability"
                                    iconClassName="h-3.5 w-3.5"
                                    content="Mark Not Applicable when scope legitimately excludes this control (e.g. no payment processing for PCI). The justification is required and appears verbatim in the SoA report."
                                />
                            </div>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm text-content-default">
                                    <input
                                        type="radio"
                                        name="applicability"
                                        value="APPLICABLE"
                                        checked={applicability === 'APPLICABLE'}
                                        onChange={() => setApplicability('APPLICABLE')}
                                    />
                                    Applicable
                                </label>
                                <label className="flex items-center gap-2 text-sm text-content-default">
                                    <input
                                        type="radio"
                                        name="applicability"
                                        value="NOT_APPLICABLE"
                                        checked={applicability === 'NOT_APPLICABLE'}
                                        onChange={() => setApplicability('NOT_APPLICABLE')}
                                    />
                                    Not Applicable
                                </label>
                            </div>
                            {applicability === 'NOT_APPLICABLE' && (
                                <>
                                    <Textarea
                                        id="control-justification-input"
                                        className="mt-2"
                                        rows={2}
                                        placeholder="Justification is required..."
                                        value={justification}
                                        onChange={(e) => setJustification(e.target.value)}
                                        required
                                        aria-label="Justification for non-applicable control"
                                        invalid={!justification.trim()}
                                    />
                                    <FormError visible={!justification.trim()}>
                                        Justification is required for non-applicable controls.
                                    </FormError>
                                </>
                            )}
                        </div>
                    </div>
                </Modal.Body>
                <Modal.Actions>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        id="new-control-cancel-btn"
                        onClick={() => {
                            if (!saving) close();
                        }}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        id="create-control-btn"
                        disabled={!canSubmit}
                    >
                        {saving ? 'Creating…' : 'Create Control'}
                    </button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
