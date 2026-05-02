'use client';

/**
 * Epic 43.1 — Evidence upload modal (multi-file dropzone).
 *
 * Builds on the Epic 54 modal shape but swaps the single-file
 * `<FileUpload>` primitive for the new generic `<FileDropzone>` from
 * `@/components/ui/FileDropzone`. The dropzone supports drag-and-drop,
 * click-to-browse, multi-file selection, and a per-file progress bar
 * driven by `XMLHttpRequest.upload.onprogress` (fetch can't surface
 * upload progress on any mainstream browser today).
 *
 * Business contract is preserved byte-for-byte:
 *   - `POST /api/t/:slug/evidence/uploads` with `FormData` carrying
 *     `file`, `title?`, `controlId?`. Each queued file is uploaded
 *     individually; the same metadata fields apply to every file in
 *     the batch.
 *   - Optimistic pending row inserted into
 *     `queryKeys.evidence.list(tenantSlug)` while each upload is in
 *     flight, replaced on success / rolled back on error.
 *   - Follow-up `POST /evidence/:id/retention` when a retention date
 *     is supplied (per uploaded evidence record).
 *   - React-Query `queryKeys.evidence.all(tenantSlug)` invalidated on
 *     settle so filters, counts, and the expiring/archived tabs
 *     refresh.
 *
 * E2E selectors preserved:
 *   - `#upload-form`, `#upload-evidence-cancel-btn`, `#submit-upload-btn`,
 *     `#file-input`, `#upload-title-input`, `#control-select`,
 *     `#retention-date-input`, `#upload-error`. The dropzone forwards
 *     `inputId="file-input"` so `setInputFiles('#file-input', …)`
 *     keeps working unchanged.
 *
 * The modal is intentionally submit-driven: drops queue files in the
 * dropzone, the operator fills metadata, clicks "Upload", and the
 * dropzone's imperative `startAll()` runs each upload sequentially.
 * Auto-start UX (drop → upload immediately) is left to a future
 * lighter-weight surface (e.g. a list-page bulk-upload tray); the
 * modal preserves the form-shaped flow operators are used to.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { Modal } from '@/components/ui/modal';
import {
    FileDropzone,
    type FileDropzoneHandle,
    type FileUploadEntry,
} from '@/components/ui/FileDropzone';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { InfoTooltip } from '@/components/ui/tooltip';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import { queryKeys } from '@/lib/queryKeys';
import { useFormTelemetry } from '@/lib/telemetry/form-telemetry';
import {
    uploadWithProgress,
    UploadHttpError,
} from '@/lib/upload/upload-with-progress';

// ─── Constraints ────────────────────────────────────────────────────
// 25 MB per file — generous enough for a signed PDF or scanned policy
// pack, still small enough to surface oversized uploads client-side
// before we burn bandwidth on a 4xx round-trip. Server-side still
// enforces the canonical limit.
const MAX_FILE_SIZE_MB = 25;

const EVIDENCE_ACCEPT =
    '.pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.doc,.docx,.xlsx,.xls,.json,.zip';

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
    const dropzoneRef = useRef<FileDropzoneHandle>(null);

    const [title, setTitle] = useState('');
    const [controlId, setControlId] = useState('');
    const [retentionUntil, setRetentionUntil] = useState('');
    const [error, setError] = useState('');
    const [queuedCount, setQueuedCount] = useState(0);
    const [uploadingAll, setUploadingAll] = useState(false);

    // Reset on every open so a previous cancel doesn't leak state.
    useEffect(() => {
        if (!open) return;
        setTitle('');
        setControlId('');
        setRetentionUntil('');
        setError('');
        setQueuedCount(0);
        setUploadingAll(false);
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

    const telemetry = useFormTelemetry('UploadEvidenceModal');

    // Single-file mutation is preserved as a thin wrapper so React
    // Query handles the optimistic-row + invalidation flow per file.
    // The actual HTTP work is `uploadWithProgress` so the dropzone's
    // progress bar updates from real network events.
    const mutation = useMutation({
        mutationFn: async (vars: {
            file: File;
            applyTitle: boolean;
            controlId: string;
            retentionUntil: string;
            onProgress: (percent: number | null) => void;
            signal: AbortSignal;
        }) => {
            const { file, applyTitle, onProgress, signal } = vars;
            const formData = new FormData();
            formData.append('file', file);
            // Apply the title input only when uploading a single file
            // (multi-file uploads just take the filename — different
            // titles would all land on the same string otherwise).
            if (applyTitle && title) formData.append('title', title);
            if (vars.controlId) formData.append('controlId', vars.controlId);

            const uploaded = await uploadWithProgress<{ id?: string }>(
                apiUrl('/evidence/uploads'),
                formData,
                {
                    onProgress: (p) => onProgress(p.percent),
                    signal,
                },
            );

            if (vars.retentionUntil && uploaded?.id) {
                await fetch(apiUrl(`/evidence/${uploaded.id}/retention`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        retentionUntil: new Date(
                            vars.retentionUntil,
                        ).toISOString(),
                        retentionPolicy: 'FIXED_DATE',
                    }),
                });
            }

            return uploaded;
        },
        // Optimistic pending row — keeps the list responsive while the
        // upload is in flight. Identical shape to the legacy single-
        // file flow so every column renderer (status badge, retention
        // pill, file-type icon) works without special-casing.
        onMutate: async (vars) => {
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
                        title: vars.applyTitle && title
                            ? title
                            : vars.file.name,
                        fileName: vars.file.name,
                        fileMimeType: vars.file.type || null,
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
            telemetry.trackError(err);
            const msg =
                err instanceof UploadHttpError
                    ? (() => {
                          const body = err.parsedBody as
                              | { error?: string; message?: string }
                              | null;
                          return body?.error || body?.message || err.message;
                      })()
                    : err instanceof Error
                      ? err.message
                      : 'Upload failed';
            setError(msg);
        },
        onSuccess: (data, _vars, context) => {
            if (context?.previousList) {
                const currentList = queryClient.getQueryData<{ id: string }[]>(
                    context.listKey,
                );
                if (currentList) {
                    queryClient.setQueryData(
                        context.listKey,
                        currentList.filter((e) => e.id !== context.tempId),
                    );
                }
            }
            telemetry.trackSuccess({
                evidenceId: (data as { id?: string })?.id,
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({
                queryKey: queryKeys.evidence.all(tenantSlug),
            });
        },
    });

    // Dropzone's `onUpload` — invoked once per file at submit time.
    // The mutation owns optimistic-row + cache invalidation; this
    // handler only bridges the dropzone's progress callback into the
    // mutation's variables.
    const handleDropzoneUpload = useCallback(
        async (
            file: File,
            ctx: { onProgress: (p: number | null) => void; signal: AbortSignal },
        ) => {
            const total = dropzoneRef.current?.getEntries().length ?? 1;
            const applyTitle = total === 1;
            return mutation.mutateAsync({
                file,
                applyTitle,
                controlId,
                retentionUntil,
                onProgress: ctx.onProgress,
                signal: ctx.signal,
            });
        },
        [mutation, controlId, retentionUntil],
    );

    const onPick = useCallback((files: File[]) => {
        setError('');
        // Add to existing count so multi-pick across drops accumulates.
        setQueuedCount((prev) => prev + files.length);
    }, []);

    const onAllSettled = useCallback((settled: FileUploadEntry[]) => {
        setUploadingAll(false);
        // Use the entries argument from FileDropzone — `getEntries()`
        // returns the ref-snapshot which still reflects the previous
        // commit at the moment `onAllSettled` fires (the ref-syncing
        // useEffect in FileDropzone hasn't run yet on this microtask).
        // Without using the live argument, the modal stayed open after
        // a successful POST in `evidence-upload-modal.spec.ts`.
        const allOk =
            settled.length > 0 && settled.every((e) => e.status === 'success');
        if (allOk) {
            // Drop the modal once every queued file landed cleanly.
            close();
        }
    }, [close]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (uploadingAll) return;
        const entries = dropzoneRef.current?.getEntries() ?? [];
        const queued = entries.filter((x) => x.status === 'queued');
        if (queued.length === 0) {
            setError('A file is required to upload evidence.');
            return;
        }
        setError('');
        telemetry.trackSubmit({
            count: queued.length,
            hasTitle: title.trim().length > 0,
            hasControlLink: Boolean(controlId),
            hasRetention: Boolean(retentionUntil),
        });
        setUploadingAll(true);
        dropzoneRef.current?.startAll().catch(() => {
            // Errors land in `mutation.onError` per file — the
            // imperative chain only signals "all done" via
            // `onAllSettled`, so no extra surface needed here.
        });
    };

    const cancel = () => {
        if (uploadingAll) {
            dropzoneRef.current?.cancelAll();
            setUploadingAll(false);
        }
        close();
    };

    const submitDisabled = queuedCount === 0 || uploadingAll;

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="lg"
            title="Upload evidence"
            description="Drag and drop one or more files — PDF, Office, CSV, image, JSON, or ZIP. Each file becomes its own evidence record."
            preventDefaultClose={uploadingAll}
        >
            <Modal.Header
                title="Upload evidence"
                description="Drag and drop one or more files (or click to browse). Files share the metadata you set below."
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

                    <fieldset className="space-y-4" disabled={uploadingAll}>
                        {/* Multi-file dropzone */}
                        <div>
                            <label
                                className="mb-1 block text-sm text-content-default"
                                htmlFor="file-input"
                            >
                                Files{' '}
                                <span className="text-content-error">*</span>
                            </label>
                            <FileDropzone
                                ref={dropzoneRef}
                                inputId="file-input"
                                accept={EVIDENCE_ACCEPT}
                                multiple
                                autoStart={false}
                                maxFileSizeMB={MAX_FILE_SIZE_MB}
                                disabled={uploadingAll}
                                onPick={onPick}
                                onUpload={handleDropzoneUpload}
                                onAllSettled={onAllSettled}
                                hint={`PDF, Office, CSV, image, JSON, or ZIP — up to ${MAX_FILE_SIZE_MB} MB per file`}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {/* Title (single-file only — see UX note below) */}
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
                                    placeholder={
                                        queuedCount > 1
                                            ? 'Each file uses its own filename'
                                            : 'Defaults to filename'
                                    }
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    autoComplete="off"
                                    disabled={queuedCount > 1}
                                />
                                {queuedCount > 1 && (
                                    <p className="mt-1 text-xs text-content-muted">
                                        Per-file titles default to the filename
                                        when uploading multiple files.
                                    </p>
                                )}
                            </div>

                            {/* Retention date.
                              Epic 58 — uses the shared DatePicker; the
                              YMD-string state is the wire format the
                              retention API consumes. `disabledDays`
                              mirrors the previous `min=today` constraint. */}
                            <div>
                                <div className="mb-1 flex items-center gap-1.5">
                                    <label
                                        className="text-sm text-content-default"
                                        htmlFor="retention-date-input"
                                    >
                                        Retain until
                                    </label>
                                    <InfoTooltip
                                        aria-label="About retention dates"
                                        iconClassName="h-3.5 w-3.5"
                                        content="After this date the evidence is archived out of the active set. It stays in the audit log — admins can still recover it."
                                    />
                                </div>
                                <DatePicker
                                    id="retention-date-input"
                                    className="w-full"
                                    placeholder="Select date"
                                    clearable
                                    align="start"
                                    value={parseYMD(retentionUntil)}
                                    onChange={(next) => {
                                        setRetentionUntil(toYMD(next) ?? '');
                                    }}
                                    disabledDays={{
                                        before: startOfUtcDay(new Date()),
                                    }}
                                    aria-label="Retain until"
                                />
                                <p className="mt-1 text-xs text-content-muted">
                                    Optional — applies to every file in the
                                    batch.
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
                        onClick={cancel}
                    >
                        {uploadingAll ? 'Stop' : 'Cancel'}
                    </button>
                    <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        id="submit-upload-btn"
                        disabled={submitDisabled}
                    >
                        {uploadingAll
                            ? 'Uploading…'
                            : queuedCount > 1
                              ? `Upload ${queuedCount} files`
                              : 'Upload'}
                    </button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
