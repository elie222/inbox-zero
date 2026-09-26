import type { PreparedOperation, TargetOutcome } from "../operations";
import type { BodyObservation, ProviderChange } from "../sync";

export type ExecutionResult =
  | {
      status: "confirmed";
      receiptId: string | null;
      observations: ProviderChange[];
      bodies?: BodyObservation[];
      targets: TargetOutcome[];
    }
  | { status: "accepted"; receiptId: string; retryAfterMs: number }
  | {
      status: "not_dispatched";
      reason: "throttled" | "blocked_auth" | "unavailable";
      retryAfterMs: number | null;
    }
  | { status: "rejected"; code: string; targets: TargetOutcome[] }
  | { status: "uncertain"; receiptId: string | null };

export type CancelResult = { status: "cancelled" | "too_late" | "unavailable" };

export interface OperationExecutor {
  /** Stops a send the server is holding until its `sendAtMs`. */
  cancel?(input: {
    operation: PreparedOperation;
    signal: AbortSignal;
  }): Promise<CancelResult>;
  execute(input: {
    operation: PreparedOperation;
    attemptId: string;
    signal: AbortSignal;
  }): Promise<ExecutionResult>;
  inspect(input: {
    operation: PreparedOperation;
    receiptId: string | null;
    signal: AbortSignal;
  }): Promise<ExecutionResult>;
  stageUpload?(input: {
    session: import("../identities").AccountSession;
    uploadId: string;
    checksum: string;
    sizeBytes: number;
    filename: string;
    contentType: string;
    bytes: AsyncIterable<Uint8Array>;
    signal: AbortSignal;
  }): Promise<
    | { status: "staged"; blobId: string }
    | {
        status: "rejected";
        code: "too_large" | "checksum_mismatch" | "missing";
      }
    | { status: "unavailable" }
  >;
}
