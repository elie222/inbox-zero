import { latestShownMessage } from "@/app/(app)/[emailAccountId]/mail/latest-shown-message";
import type { ThreadSelection } from "@/app/(app)/[emailAccountId]/mail/types";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import type { EmailLabels } from "@/providers/email-label-types";
import {
  MAX_MAIL_VIEW_SELECTED_THREADS,
  type MailViewContext,
} from "@/utils/ai/assistant/chat-context-validation";
import {
  type MailSplit,
  OTHER_SPLIT_ID,
} from "@/utils/split-inbox/split-query";

/** A sidebar label, folder, or mailbox the list is narrowed to. */
type ChatMailScope = {
  labelId: string | null;
  folderId: string | null;
  type: string | null;
  title: string | null;
};

/** What the assistant chat is told about the mail screen. */
export function buildChatMailView({
  emailAccountId,
  isAllAccounts,
  searchQuery,
  scope,
  activeSplit,
  userLabels,
  selectedTargets,
  hiddenDraftMessageIds,
}: {
  emailAccountId: string;
  isAllAccounts: boolean;
  searchQuery: string | null;
  scope: ChatMailScope | null;
  activeSplit: MailSplit | undefined;
  userLabels: EmailLabels;
  selectedTargets: { messages: { id: string }[]; selection: ThreadSelection }[];
  hiddenDraftMessageIds: string[];
}): MailViewContext {
  return {
    view: getView({ searchQuery, scope, activeSplit, userLabels }),
    allAccounts: isAllAccounts,
    selectedCount: selectedTargets.length,
    selectedThreads: selectedTargets
      .filter((target) => target.selection.emailAccountId === emailAccountId)
      .flatMap((target) => {
        const message = latestShownMessage(
          target.messages,
          hiddenDraftMessageIds,
        );
        return message
          ? [{ threadId: target.selection.threadId, messageId: message.id }]
          : [];
      })
      .slice(0, MAX_MAIL_VIEW_SELECTED_THREADS),
  };
}

function getView({
  searchQuery,
  scope,
  activeSplit,
  userLabels,
}: {
  searchQuery: string | null;
  scope: ChatMailScope | null;
  activeSplit: MailSplit | undefined;
  userLabels: EmailLabels;
}): MailViewContext["view"] {
  if (searchQuery) return { kind: "search", query: searchQuery };
  if (scope) {
    const name = scope.title ?? scope.labelId ?? scope.folderId ?? scope.type;
    if (scope.labelId) return { kind: "label", name: name ?? "" };
    if (scope.folderId) return { kind: "folder", name: name ?? "" };
    return { kind: "mailbox", name: name ?? "" };
  }
  if (!activeSplit) return { kind: "mailbox", name: "Inbox" };

  return {
    kind: "split",
    name: activeSplit.name,
    matchAll: activeSplit.matchAll,
    filters: activeSplit.filters.map(({ kind, value }) => ({
      kind,
      value:
        kind === MailSplitFilterKind.LABEL && value
          ? (userLabels[value]?.name ?? value)
          : value,
    })),
    ...(activeSplit.id === OTHER_SPLIT_ID ? { isRemainder: true } : {}),
  };
}
