"use client";

/**
 * `<FileTypeIcon>` — small icon + colour for a file based on its
 * extension, MIME, or the domain row kind (LINK / TEXT / NOTE).
 *
 * Lives at the primitive layer so the same mapping powers the
 * evidence list (Epic 43), the upload dropzone's per-row icon, and
 * any future file-bearing surface (e.g. policy attachments).
 *
 * The pure mapping function `resolveFileTypeIcon` lives in
 * `./file-type-icon.ts` so node-only unit tests can import it
 * without dragging in JSX.
 */

import {
    resolveFileTypeIcon,
    type FileTypeMatch,
} from './file-icon-resolver';

export { resolveFileTypeIcon };
export type { FileTypeMatch };

export function FileTypeIcon({
    fileName,
    mime,
    domainKind,
    size = 16,
    className = '',
    'data-testid': dataTestId,
}: {
    fileName?: string | null;
    mime?: string | null;
    domainKind?: string | null;
    size?: number;
    className?: string;
    'data-testid'?: string;
}) {
    const match = resolveFileTypeIcon(fileName, mime, domainKind);
    const { Icon, colorClass, label } = match;
    return (
        <Icon
            size={size}
            className={`${colorClass} ${className}`.trim()}
            aria-label={label}
            role="img"
            data-testid={dataTestId}
            data-file-kind={label.toLowerCase()}
        />
    );
}
