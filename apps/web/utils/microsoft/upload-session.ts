import type { UploadSession } from "@microsoft/microsoft-graph-types";
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
 * - Outlook attachment sessions: this caller uses 320 KiB chunks
 * - Drive upload sessions: chunks must be multiples of 320 KiB
 *
 * Returns the final response when it is available. If a retry proves that the
 * final chunk was already accepted after its response was lost, returns a
 * committed result so the caller can recover the created resource.
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
}): Promise<UploadResult> {
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
        return result;
      }

      if (result.nextStart === content.length) {
        return { kind: "committed" };
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

type UploadResult =
  | { kind: "complete"; response: Response }
  | { kind: "committed" };

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
  const response = await fetchUploadSession(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${start}-${end - 1}/${totalSize}`,
    },
    body: new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength),
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
        }),
      };
    }

    if (typeof uploadStatus.id !== "string" || !uploadStatus.id) {
      throw new Error(
        "Upload session returned 200 without nextExpectedRanges or a created item",
      );
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
        unavailableNextStart: end,
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
}: {
  nextStart: number;
  chunkSizeBytes: number;
  totalSize: number;
  uploadUrl: string;
  statusAction: string;
  start: number;
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
  });
}

async function resolveResumeRange({
  chunkSizeBytes,
  totalSize,
  uploadUrl,
  statusAction,
  start,
  unavailableNextStart,
}: {
  chunkSizeBytes: number;
  totalSize: number;
  uploadUrl: string;
  statusAction: string;
  start: number;
  unavailableNextStart?: number;
}): Promise<number> {
  const uploadStatus = await getUploadSessionStatus(uploadUrl, statusAction);
  if (!uploadStatus) {
    if (typeof unavailableNextStart === "number") {
      return unavailableNextStart;
    }
    throw new Error("Upload session status is unavailable");
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
    (nextStart === totalSize || nextStart % chunkSizeBytes === 0)
  );
}

interface UploadSessionStatus
  extends Pick<UploadSession, "nextExpectedRanges"> {
  id?: unknown;
}

async function getUploadSessionStatus(
  uploadUrl: string,
  statusAction: string,
): Promise<UploadSessionStatus | null> {
  const response = await fetchUploadSession(uploadUrl, {
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
  await fetchUploadSession(uploadUrl, {
    method: "DELETE",
    signal: AbortSignal.timeout(UPLOAD_SESSION_REQUEST_TIMEOUT_MS),
  });
}

async function fetchUploadSession(
  uploadUrl: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(uploadUrl, init);
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TypeError("fetch failed", { cause: error });
    }
    throw error;
  }
}

function getNextExpectedRangeStart(nextExpectedRanges?: string[] | null) {
  const nextRange = nextExpectedRanges?.[0];
  if (!nextRange) return null;

  const [rangeStart] = nextRange.split("-");
  if (!rangeStart) return null;

  const parsedRangeStart = Number(rangeStart);
  return Number.isSafeInteger(parsedRangeStart) && parsedRangeStart >= 0
    ? parsedRangeStart
    : null;
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
