import { vi } from "vitest";
import { LogicalOperator } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type {
  ParsedMessage,
  ParsedMessageHeaders,
  RuleWithActions,
} from "@/utils/types";

export function getProvider({ isThread = false }: { isThread?: boolean } = {}) {
  return {
    isReplyInThread: vi.fn().mockReturnValue(isThread),
  } as unknown as EmailProvider;
}

export function getRule(
  overrides: Partial<RuleWithActions> = {},
): RuleWithActions {
  const {
    id = "r123",
    createdAt = new Date(),
    updatedAt = new Date(),
    name = "Rule Name",
    enabled = true,
    automate = true,
    runOnThreads = true,
    emailAccountId = "emailAccountId",
    organizationRuleId = null,
    organizationRuleMemberEnabled = null,
    conditionalOperator = LogicalOperator.AND,
    instructions = null,
    groupId = null,
    from = null,
    to = null,
    subject = null,
    subjectMatchMode = "CONTAINS" as const,
    body = null,
    categoryFilterType = null,
    systemType = null,
    promptText = null,
    excludeKnownContacts = false,
    fromExclude = false,
    toExclude = false,
    subjectExclude = false,
    actions = [],
  } = overrides;

  return {
    id,
    createdAt,
    updatedAt,
    name,
    enabled,
    automate,
    runOnThreads,
    emailAccountId,
    organizationRuleId,
    organizationRuleMemberEnabled,
    conditionalOperator,
    instructions,
    groupId,
    from,
    to,
    subject,
    subjectMatchMode,
    body,
    categoryFilterType,
    systemType,
    promptText,
    excludeKnownContacts,
    fromExclude,
    toExclude,
    subjectExclude,
    actions,
  };
}

export function getHeaders(
  overrides: Partial<ParsedMessageHeaders> = {},
): ParsedMessageHeaders {
  const {
    subject = "Subject",
    from = "from@example.com",
    to = "to@example.com",
    cc,
    bcc,
    date = new Date().toISOString(),
    "message-id": messageId,
    "reply-to": replyTo,
    "in-reply-to": inReplyTo,
    references,
    "list-unsubscribe": listUnsubscribe,
  } = overrides;

  return {
    subject,
    from,
    to,
    cc,
    bcc,
    date,
    "message-id": messageId,
    "reply-to": replyTo,
    "in-reply-to": inReplyTo,
    references,
    "list-unsubscribe": listUnsubscribe,
  };
}

export function getMessage(
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage {
  const {
    id = "m1",
    threadId = "m1",
    labelIds = [],
    snippet = "snippet",
    historyId = "h1",
    attachments = [],
    inline = [],
    headers = getHeaders(),
    textPlain = "textPlain",
    textHtml = "textHtml",
    subject = "subject",
    date = new Date().toISOString(),
    conversationIndex = null,
    internalDate = null,
    bodyContentType,
    rawRecipients,
  } = overrides;

  return {
    id,
    threadId,
    labelIds,
    snippet,
    historyId,
    attachments,
    inline,
    headers,
    textPlain,
    textHtml,
    subject,
    date,
    conversationIndex,
    internalDate,
    bodyContentType,
    rawRecipients,
  };
}
