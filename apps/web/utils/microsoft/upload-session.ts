import type { Logger } from "@/utils/logger";
import { withOutlookRetry } from "@/utils/outlook/retry";

// Per-request bound so a hung connection stalls the upload for at most this
// long. Chunk uploads already retry transient failures via `withOutlookRetry`.
const UPLOAD_SESSION_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Uploads a Buffer to a Microsoft Graph upload session in chunks.
 *
 * Shared by Outlook attachment uploads and OneDrive file uploads. Both use
 * the same protocol (PUT chunks with Content-Range, resume from
 * `nextExpectedRanges`), but each resource has its own chunk-size constraint:
 * - Outlook attachment sessions: chunks must be exactly 320 KiB
 * - Drive upload sessions: chunks must be multiples of 320 KiB
 *
 * Returns the final response, whose body is the created resource. Microsoft
 * documents the final range as answered with 201 Created or 200 OK; a 200
 * response whose body lacks `nextExpectedRanges` is the created resource, not
 * a progress update. Callers must therefore inspect the returned body.
 *
 * If any chunk fails, the session is cancelled with a DELETE so Microsoft does
 * not keep it alive for up to 48 hours or surface partial items on retry.
 */
export async function uploadResumableChunks({
  uploadUrl,
  content,
  chunkSizeBytes,
  logger,
  action,
  statusAction,
}: {
  uploadUrl: string;
  content: Buffer;
  chunkSizeBytes: number;
  logger: Logger;
  action: string;
  statusAction: string;
}): Promise<Response> {
  let start = 0;
  try {
    while (start < content.length) {
      const end = Math.min(start + chunkSizeBytes, content.length);
      const chunk = content.subarray(start, end);
      const result = await withOutlookRetry(
        () =>
          uploadChunk({
            uploadUrl,
            chunk,
            start,
            end,
            totalSize: content.length,
            chunkSizeBytes,
            action,
            statusAction,
          }),
        logger,
      );

      if (result.kind === "complete") {
        return result.response;
      }

      start = result.nextStart;
    }

    throw new Error(
      `Failed to ${action}: upload session ended without returning the created item`,
    );
  } catch (error) {
    // Best-effort cleanup: deleting the session is a documented cancellation.
    await cancelUploadSession(uploadUrl).catch(() => undefined);
    throw error;
  }
}

type ChunkUploadResult =
  | { kind: "complete"; response: Response }
  | { kind: "progress"; nextStart: number };

async function uploadChunk({
  uploadUrl,
  chunk,
  start,
  end,
  totalSize,
  chunkSizeBytes,
  action,
  statusAction,
}: {
  uploadUrl: string;
  chunk: Buffer;
  start: number;
  end: number;
  totalSize: number;
  chunkSizeBytes: number;
  action: string;
  statusAction: string;
}): Promise<ChunkUploadResult> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${start}-${end - 1}/${totalSize}`,
    },
    body: new Uint8Array(chunk),
    signal: AbortSignal.timeout(UPLOAD_SESSION_REQUEST_TIMEOUT_MS),
  });

  if (response.status === 201) {
    return { kind: "complete", response };
  }

  if (response.status === 200) {
    // A 200 is a progress response when it carries nextExpectedRanges, but for
    // the final range it is answered with the created resource in the body
    // instead (Microsoft documents the last range as 201 Created or 200 OK).
    // The body is peeked via a clone so the caller can still read it.
    const uploadStatus = (await response.clone().json()) as UploadSessionStatus;
    const nextStart = getNextExpectedRangeStart(
      uploadStatus.nextExpectedRanges,
    );
    if (typeof nextStart === "number") {
      return {
        kind: "progress",
        nextStart: await ensureMonotonicProgress({
          nextStart,
          chunkSizeBytes,
          totalSize,
          uploadUrl,
          statusAction,
          start,
          end,
        }),
      };
    }

    return { kind: "complete", response };
  }

  if (response.status === 202) {
    const uploadStatus = (await response.json()) as UploadSessionStatus;
    const nextStart = getNextExpectedRangeStart(
      uploadStatus.nextExpectedRanges,
    );
    if (typeof nextStart !== "number") {
      throw new Error("Upload session returned 202 without nextExpectedRanges");
    }

    return {
      kind: "progress",
      nextStart: await ensureMonotonicProgress({
        nextStart,
        chunkSizeBytes,
        totalSize,
        uploadUrl,
        statusAction,
        start,
        end,
      }),
    };
  }

  if (response.status === 416) {
    return {
      kind: "progress",
      nextStart: await resolveResumeRange({
        chunkSizeBytes,
        totalSize,
        uploadUrl,
        statusAction,
        start,
        end,
      }),
    };
  }

  return await throwUploadSessionResponseError(response, action);
}

// The server reports where to continue via `nextExpectedRanges`, which the
// docs warn is not guaranteed to list every range. A response that fails to
// advance, or advances by a partial chunk (one byte at a time would otherwise
// mean O(n) requests), is not trusted: recover from the session status like a
// 416 and throw when the server offers no usable range.
async function ensureMonotonicProgress({
  nextStart,
  chunkSizeBytes,
  totalSize,
  uploadUrl,
  statusAction,
  start,
  end,
}: {
  nextStart: number;
  chunkSizeBytes: number;
  totalSize: number;
  uploadUrl: string;
  statusAction: string;
  start: number;
  end: number;
}): Promise<number> {
  if (isTrustedProgress(nextStart, start, chunkSizeBytes, totalSize)) {
    return nextStart;
  }

  return await resolveResumeRange({
    chunkSizeBytes,
    totalSize,
    uploadUrl,
    statusAction,
    start,
    end,
  });
}

async function resolveResumeRange({
  chunkSizeBytes,
  totalSize,
  uploadUrl,
  statusAction,
  start,
  end,
}: {
  chunkSizeBytes: number;
  totalSize: number;
  uploadUrl: string;
  statusAction: string;
  start: number;
  end: number;
}): Promise<number> {
  const uploadStatus = await getUploadSessionStatus(uploadUrl, statusAction);
  if (!uploadStatus) {
    // Session unavailable (expired or unknown); assume the chunk was received
    return end;
  }

  const nextStart = getNextExpectedRangeStart(uploadStatus.nextExpectedRanges);
  if (
    typeof nextStart === "number" &&
    isTrustedProgress(nextStart, start, chunkSizeBytes, totalSize)
  ) {
    return nextStart;
  }

  throw new Error(
    "Upload session did not make progress (no usable resume range)",
  );
}

// Only chunk-aligned ranges are trusted: the upload always sends full chunks
// from chunk-aligned offsets, and documented servers resume from a chunk
// boundary (or from the end of the file).
function isTrustedProgress(
  nextStart: number,
  start: number,
  chunkSizeBytes: number,
  totalSize: number,
): boolean {
  return (
    nextStart > start &&
    (nextStart >= totalSize || nextStart % chunkSizeBytes === 0)
  );
}

interface UploadSessionStatus {
  nextExpectedRanges?: string[];
}

async function getUploadSessionStatus(
  uploadUrl: string,
  statusAction: string,
): Promise<UploadSessionStatus | null> {
  const response = await fetch(uploadUrl, {
    method: "GET",
    signal: AbortSignal.timeout(UPLOAD_SESSION_REQUEST_TIMEOUT_MS),
  });

  if (response.status === 404 || response.status === 405) {
    return null;
  }

  if (!response.ok) {
    return await throwUploadSessionResponseError(response, statusAction);
  }

  return (await response.json()) as UploadSessionStatus;
}

async function cancelUploadSession(uploadUrl: string): Promise<void> {
  await fetch(uploadUrl, {
    method: "DELETE",
    signal: AbortSignal.timeout(UPLOAD_SESSION_REQUEST_TIMEOUT_MS),
  });
}

function getNextExpectedRangeStart(nextExpectedRanges?: string[]) {
  const nextRange = nextExpectedRanges?.[0];
  if (!nextRange) return null;

  const [rangeStart] = nextRange.split("-");
  if (!rangeStart) return null;

  const parsedRangeStart = Number.parseInt(rangeStart, 10);
  return Number.isNaN(parsedRangeStart) ? null : parsedRangeStart;
}

async function throwUploadSessionResponseError(
  response: Response,
  action: string,
): Promise<never> {
  const errorText = await response.text();
  const error = new Error(
    `Failed to ${action}: ${response.status} ${errorText || response.statusText}`,
  );
  Object.assign(error, {
    status: response.status,
    body: errorText,
    response: { headers: response.headers, status: response.status },
  });
  throw error;
}
