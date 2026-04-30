/**
 * `uploadWithProgress` — POST a `FormData` body and stream upload
 * progress percentages back to the caller.
 *
 * `fetch` doesn't expose `progress` events for outbound bodies in any
 * mainstream browser today; the request streams API technically allows
 * it but only behind a flag in Chrome. XHR's `upload.onprogress` has
 * worked for a decade and is what every "real" upload UI in the wild
 * (S3 multipart, Drive, Dropbox) leans on. We use it here for the
 * `<FileDropzone>` per-file progress bar.
 *
 * The helper is deliberately tiny:
 *   - takes a URL + body,
 *   - optionally wires an `AbortSignal` so a cancelled upload aborts
 *     the in-flight XHR (matches `fetch({ signal })` semantics),
 *   - resolves to the parsed JSON response on 2xx, rejects on
 *     network error / non-2xx / abort.
 *
 * Lives at the lib layer so non-evidence callers (policy attachments,
 * audit-pack imports) can reuse it without depending on UI code.
 */

export interface UploadProgress {
    loaded: number;
    total: number;
    /** 0–100, rounded. `null` if length isn't computable. */
    percent: number | null;
}

export interface UploadWithProgressOptions {
    method?: 'POST' | 'PUT';
    headers?: Record<string, string>;
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
}

export class UploadHttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly body: string,
        public readonly parsedBody: unknown,
    ) {
        super(`upload failed with status ${status}`);
        this.name = 'UploadHttpError';
    }
}

export class UploadAbortedError extends Error {
    constructor() {
        super('upload aborted');
        this.name = 'UploadAbortedError';
    }
}

/**
 * Body shapes XHR can actually accept (`BodyInit` is a fetch-only
 * superset that includes `ReadableStream`, which XHR doesn't support).
 * Narrowing here keeps the helper's surface honest.
 */
export type UploadBody = XMLHttpRequestBodyInit;

export function uploadWithProgress<T = unknown>(
    url: string,
    body: UploadBody,
    options: UploadWithProgressOptions = {},
): Promise<T> {
    const { method = 'POST', headers, onProgress, signal } = options;
    return new Promise<T>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new UploadAbortedError());
            return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        if (headers) {
            for (const [k, v] of Object.entries(headers)) {
                xhr.setRequestHeader(k, v);
            }
        }

        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                onProgress({
                    loaded: e.loaded,
                    total: e.total,
                    percent: e.lengthComputable
                        ? Math.round((e.loaded / e.total) * 100)
                        : null,
                });
            };
        }

        xhr.onload = () => {
            const text = xhr.responseText;
            let parsed: unknown = null;
            try {
                parsed = text ? JSON.parse(text) : null;
            } catch {
                parsed = text;
            }
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(parsed as T);
            } else {
                reject(new UploadHttpError(xhr.status, text, parsed));
            }
        };
        xhr.onerror = () => reject(new Error('network error'));
        xhr.onabort = () => reject(new UploadAbortedError());

        if (signal) {
            signal.addEventListener('abort', () => xhr.abort(), { once: true });
        }

        xhr.send(body);
    });
}
