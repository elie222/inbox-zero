import {
  engineCommandKind,
  engineCommandPayload,
  engineCommandStatus,
} from "@/utils/mail-engine/command-status";

export type InspectCommand = {
  status: string;
  kind: string;
  changeKind: string | null;
  change: Record<string, unknown> | null;
  messageIds: string[];
  conversationIds: string[];
};

export type InspectMutationMatch = {
  kind: string;
  threadId?: string;
  payload?: Record<string, unknown>;
};

export function inspectCommandMatchesThread(
  command: Pick<InspectCommand, "conversationIds" | "messageIds">,
  threadId: string | undefined,
) {
  if (!threadId) return true;
  if (command.conversationIds.includes(threadId)) return true;
  if (command.messageIds.some((messageId) => messageId.includes(threadId))) {
    return true;
  }
  if (!threadId.startsWith("thr_")) return false;
  const slug = threadId.slice("thr_".length);
  return command.messageIds.some(
    (messageId) =>
      messageId === `msg_${slug}` || messageId.startsWith(`msg_${slug}_`),
  );
}

export function inspectCommandMatchesPayload(
  command: Pick<InspectCommand, "change">,
  payload: Record<string, unknown> | undefined,
) {
  if (!payload) return true;
  const actual = engineCommandPayload(command.change);
  if (!actual) return false;
  const observed: Record<string, unknown> = { ...actual };
  return Object.entries(payload).every(
    ([key, value]) => observed[key] === value,
  );
}

export function inspectCommandMatches(
  command: InspectCommand,
  expected: InspectMutationMatch,
) {
  const kind = engineCommandKind(command);
  const kindMatches =
    kind === expected.kind ||
    (expected.kind === "reply" && command.kind === "send");
  return (
    kindMatches &&
    inspectCommandMatchesThread(command, expected.threadId) &&
    inspectCommandMatchesPayload(command, expected.payload)
  );
}

export function inspectCommandToMutation(command: InspectCommand) {
  return {
    kind: engineCommandKind(command),
    status: engineCommandStatus(command.status),
    threadId: command.conversationIds[0],
    payload: engineCommandPayload(command.change),
  };
}
