import type { AccountSession } from "../identities";

export type AssistantStatePage = {
  session: AccountSession;
  cursor: string | null;
  nextCursor: string | null;
  reset: boolean;
  entries: Array<{
    id: string;
    revision: string;
    messageId: string | null;
    conversationId: string | null;
    kind: string;
    payload: unknown;
  }>;
};

export interface AssistantStateSource {
  read(input: {
    session: AccountSession;
    cursor: string | null;
    signal: AbortSignal;
  }): Promise<
    | { status: "ok"; page: AssistantStatePage }
    | { status: "paused"; retryAfterMs: number }
    | { status: "blocked_auth" }
  >;
}
