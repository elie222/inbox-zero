import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
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
  // A verifying send is with the server, which delivers it without this device.
  if (!online) return status !== "verifying";
  return NEEDS_DELIVERY_ATTENTION.has(status);
}

export function engineDeliveryLabel(
  status: string,
  online: boolean,
  i18n: I18n,
) {
  switch (status) {
    case "succeeded":
      return t(i18n)`Reply sent`;
    case "executing":
    case "verifying":
      return t(i18n)`Sending…`;
    case "uncertain":
      return t(i18n)`Couldn't confirm delivery`;
    case "failed":
    case "needs_attention":
      return t(i18n)`Reply could not be sent`;
    case "blocked_auth":
      return t(i18n)`Reconnect your account to send this reply`;
    default:
      return online ? t(i18n)`Sending…` : t(i18n)`Waiting for connection`;
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
