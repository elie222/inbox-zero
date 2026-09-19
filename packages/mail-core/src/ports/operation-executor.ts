import type { PreparedOperation, TargetOutcome } from "../operations";
import type { ProviderChange } from "../sync";

export type ExecutionResult =
  | {
      status: "confirmed";
      receiptId: string | null;
      observations: ProviderChange[];
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

export interface OperationExecutor {
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
}
