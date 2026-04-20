'use client';

/**
 * Epic 54 — Upload Evidence modal.
 *
 * Replaces the inline `#upload-form` that previously lived in
 * EvidenceClient with a modal-first flow built on the shared `<Modal>` +
 * `<FileUpload>` primitives.
 *
 * Business contract is preserved byte-for-byte:
 *   - `POST /api/t/:slug/evidence/uploads` with `FormData` containing
 *     `file`, `title?`, `controlId?`, `retentionUntil?` (ISO).
 *   - Optimistic pending row inserted into
 *     `queryKeys.evidence.list(tenantSlug)` while the upload is in-flight;
 *     replaced on success, rolled back on error.
 *   - Follow-up `POST /evidence/:id/retention` when a retention date is
 *     supplied, mirroring the legacy two-call sequence.
 *   - React-Query `queryKeys.evidence.all(tenantSlug)` invalidated on
 *     settle so filters, counts, and the expiring/archived tabs refresh.
 *
 * Form IDs (`upload-form`, `file-input`, `upload-title-input`,
 * `control-search-input`, `control-select`, `retention-date-input`,
 * `submit-upload-btn`, `upload-error`) are preserved so the pre-migration
 * E2E suite continues to pass untouched.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { Modal } from '@/components/ui/modal';
import { FileUpload } from '@/components/ui/file-upload';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { queryKeys } from '@/lib/queryKeys';

// ─── Constraints ────────────────────────────────────────────────────
// 25 MB — generous enough for a signed PDF or a scanned policy pack,
// still small enough to surface oversized uploads client-side before we
// burn bandwidth on a 4xx round-trip. Server-side still enforces the
// canonical limit.
const MAX_FILE_SIZE_MB = 25;

// ─── Types ──────────────────────────────────────────────────────────

interface ControlOption {
    id: string;
    name: string;
    code?: string | null;
    annexId?: string | null;
}

export interface UploadEvidenceModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    tenantSlug: string;
    apiUrl: (path: string) => string;
    controls: ControlOption[];
}

function formatBytes(bytes: number | null | undefined): string {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ─── Component ──────────────────────────────────────────────────────

export function UploadEvidenceModal({
    open,
    setOpen,
    tenantSlug,
    apiUrl,
    controls,
}: UploadEvidenceModalProps) {
    const close = useCallback(() => setOpen(false), [setOpen]);
    const queryClient = useQueryClient();

    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [controlId, setControlId] = useState('');
    const [retentionUntil, setRetentionUntil] = useState('');
    const [error, setError] = useState('');

    // Reset on every open so a previous cancel doesn't leak state.
    useEffect(() => {
        if (!open) return;
        setFile(null);
        setTitle('');
        setControlId('');
        setRetentionUntil('');
        setError('');
    }, [open]);

    // Project controls into ComboboxOption shape. The annexId + code +
    // name are all folded into the label so cmdk's fuzzy-match scoring
    // hits on any of them — typing "A.5.1" or "access review" or the
    // raw control code all filter to the same row.
    const controlOptions = useMemo<ComboboxOption<ControlOption>[]>(
        () =>
            controls.map((c) => ({
                value: c.id,
                label: `${c.annexId || c.code || 'Custom'}: ${c.name}`,
                meta: c,
            })),
        [controls],
    );

    const mutation = useMutation({
        mutationFn: async ({
            file,
            title,
            controlId,
            retentionUntil,
        }: {
            file: File;
            title: string;
            controlId: string;
            retentionUntil: string;
        }) => {
            const formData = new FormData();
            formData.append('file', file);
            if (title) formData.append('title', title);
            if (controlId) formData.append('controlId', controlId);
            if (retentionUntil)
                formData.append(
                    'retentionUntil',
                    new Date(retentionUntil).toISOString(),
                );

            const res = await fetch(apiUrl('/evidence/uploads'), {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res
                    .json()
                    .catch(() => ({ error: 'Upload failed' }));
                throw new Error(err.error || err.message || 'Upload failed');
            }

            const uploaded = await res.json();

            if (retentionUntil && uploaded?.id) {
                await fetch(apiUrl(`/evidence/${uploaded.id}/retention`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        retentionUntil: new Date(retentionUntil).toISOString(),
                        retentionPolicy: 'FIXED_DATE',
                    }),
                });
            }

            return uploaded;
        },
        // Optimistic pending row — keeps the list responsive while we
        // wait on S3. Identical shape to the legacy inline upload so
        // every column renderer (status badge, retention pill, etc.)
        // works without special-casing.
        onMutate: async ({ file, title }) => {
            await queryClient.cancelQueries({
                queryKey: queryKeys.evidence.all(tenantSlug),
            });
            const listKey = queryKeys.evidence.list(tenantSlug);
            const previousList = queryClient.getQueryData<unknown[]>(listKey);

            const tempId = `temp:${crypto.randomUUID()}`;
            if (previousList) {
                queryClient.setQueryData<unknown[]>(listKey, [
                    {
                        id: tempId,
                        title: title || file.name,
                        fileName: file.name,
                        type: 'FILE',
                        status: 'PENDING_UPLOAD',
                        owner: null,
                        control: null,
                        controlId: null,
                        retentionUntil: null,
                        isArchived: false,
                        expiredAt: null,
                        deletedAt: null,
                        fileRecordId: null,
                    },
                    ...previousList,
                ]);
            }

            return { previousList, listKey, tempId };
        },
        onError: (err, _vars, context) => {
            if (context?.previousList) {
                queryClient.setQueryData(context.listKey, context.previousList);
            }
            setError(err instanceof Error ? err.message : 'Upload failed');
        },
        onSuccess: (_data, _vars, context) => {
            if (context?.previousList) {
                const currentList = queryClient.getQueryData<
                    { id: string }[]
                >(context.listKey);
                if (currentList) {
                    queryClient.setQueryData(
                        context.listKey,
                        currentList.filter((e) => e.id !== context.tempId),
                    );
                }
            }
            close();
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.evidence.all(tenantSlug),
            });
        },
    });

    const canSubmit = !!file && !mutation.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || mutation.isPending) return;
        setError('');
        mutation.mutate({ file, title, controlId, retentionUntil });
    };

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="lg"
            title="Upload evidence"
            description="Attach a signed PDF, screenshot, export, or archive to your register."
            preventDefaultClose={mutation.isPending}
        >
            <Modal.Header
                title="Upload evidence"
                description="Drag and drop a file or click to browse."
            />
            <Modal.Form id="upload-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="upload-error"
                            role="alert"
                            data-testid="upload-evidence-error"
                        >
                            {error}
                        </div>
                    )}

                    <fieldset
                        className="space-y-4"
                        disabled={mutation.isPending}
                    >
                        {/* Dropzone */}
                        <div>
                            <label
                                className="mb-1 block text-sm text-content-default"
                                htmlFor="file-input"
                            >
                                File <span className="text-content-error">*</span>
                            </label>
                            <FileUpload
                                id="file-input"
                                accept="evidence"
                                variant="document"
                                maxFileSizeMB={MAX_FILE_SIZE_MB}
                                loading={mutation.isPending}
                                accessibilityLabel="Drop evidence file"
                                content={
                                    file ? (
                                        <p className="text-content-emphasis">
                                            {file.name}{' '}
                                            <span className="text-content-muted">
                                                ({formatBytes(file.size)})
                                            </span>
                                        </p>
                                    ) : (
                                        <>
                                            <p className="text-content-emphasis">
                                                Drag and drop or click to upload
                                            </p>
                                            <p className="mt-0.5 text-xs text-content-muted">
                                                PDF, Office, CSV, image, JSON, or ZIP — up to{' '}
                                                {MAX_FILE_SIZE_MB} MB
                                            </p>
                                        </>
                                    )
                                }
                                onChange={({ file }) => {
                                    setFile(file);
                                    setError('');
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {/* Title (optional) */}
                            <div>
                                <label
                                    className="mb-1 block text-sm text-content-default"
                                    htmlFor="upload-title-input"
                                >
                                    Title
                                </label>
                                <input
                                    id="upload-title-input"
                                    type="text"
                                    className="input w-full"
                                    placeholder="Defaults to filename"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    autoComplete="off"
                                />
                            </div>

                            {/* Retention date */}
                            <div>
                                <label
                                    className="mb-1 block text-sm text-content-default"
                                    htmlFor="retention-date-input"
                                >
                                    Retain until
                                </label>
                                <input
                                    id="retention-date-input"
                                    type="date"
                                    className="input w-full"
                                    value={retentionUntil}
                                    onChange={(e) =>
                                        setRetentionUntil(e.target.value)
                                    }
                                    min={
                                        new Date().toISOString().split('T')[0]
                                    }
                                />
                                <p className="mt-1 text-xs text-content-muted">
                                    Optional — when this evidence expires.
                                </p>
                            </div>
                        </div>

                        {/* Control link — Epic 55: searchable Combobox */}
                        <FormField
                            label="Link to control"
                            description={
                                controls.length === 0
                                    ? 'No controls available to link yet.'
                                    : `Search across ${controls.length} control${controls.length === 1 ? '' : 's'} by annex id, code, or name.`
                            }
                        >
                            <Combobox<false, ControlOption>
                                id="control-select"
                                name="controlId"
                                options={controlOptions}
                                selected={
                                    controlOptions.find(
                                        (o) => o.value === controlId,
                                    ) ?? null
                                }
                                setSelected={(option) =>
                                    setControlId(option?.value ?? '')
                                }
                                placeholder="— No control link"
                                searchPlaceholder="Search controls…"
                                emptyState="No controls match"
                                matchTriggerWidth
                                forceDropdown
                                buttonProps={{ className: 'w-full' }}
                                caret
                            />
                        </FormField>
                    </fieldset>
                </Modal.Body>

                <Modal.Actions>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        id="upload-evidence-cancel-btn"
                        onClick={() => {
                            if (!mutation.isPending) close();
                        }}
                        disabled={mutation.isPending}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        id="submit-upload-btn"
                        disabled={!canSubmit}
                    >
                        {mutation.isPending ? 'Uploading…' : 'Upload'}
                    </button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
