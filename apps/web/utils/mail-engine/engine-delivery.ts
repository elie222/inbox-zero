import type { OperationStatus } from "@inboxzero/mail-core/operations";

export type EngineSendCommand = {
  operationId: string;
  status: OperationStatus;
  kind: string;
  conversationIds: string[];
  messageIds: string[];
};

const NEEDS_DELIVERY_ATTENTION = new Set<string>([
  "blocked_auth",
  "failed",
  "retry_wait",
  "uncertain",
  "needs_attention",
]);

export function engineSendCommandsForThread(
  commands: EngineSendCommand[],
  threadId: string,
) {
  return commands.filter(
    (command) =>
      command.kind === "send" && command.conversationIds.includes(threadId),
  );
}

export function shouldShowEngineDeliveryStatus({
  online,
  status,
}: {
  online: boolean;
  status: string;
}) {
  if (!online) return true;
  return NEEDS_DELIVERY_ATTENTION.has(status);
}

export function engineDeliveryLabel(status: string, online: boolean) {
  switch (status) {
    case "succeeded":
      return "Reply sent";
    case "executing":
    case "verifying":
      return "Sending…";
    case "uncertain":
      return "Delivery uncertain";
    case "failed":
    case "needs_attention":
      return "Reply could not be sent";
    case "blocked_auth":
      return "Reconnect your account to send this reply";
    default:
      return online ? "Sending…" : "Waiting for connection";
  }
}

export function canEditEngineSend(status: string, online: boolean) {
  if (online && (status === "executing" || status === "verifying"))
    return false;
  return [
    "queued",
    "preparing",
    "retry_wait",
    "blocked_auth",
    "failed",
    "needs_attention",
  ].includes(status);
}

export function engineSendReplyMessageId(
  command: { messageIds: string[] },
  threadMessageIds: string[],
  threadId: string,
) {
  // The last thread row is often a later SENT from an earlier test on the
  // shared emulator mailbox. Fall back to the original message instead.
  return command.messageIds[0] ?? threadMessageIds[0] ?? threadId;
}
