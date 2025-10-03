import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { type Action, LogicalOperator } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export function getEmailAccount(
  overrides: Partial<EmailAccountWithAI> = {},
): EmailAccountWithAI {
  return {
    id: "email-account-id",
    userId: "user1",
    email: overrides.email || "user@test.com",
    about: null,
    user: {
      aiModel: null,
      aiProvider: null,
      aiApiKey: null,
    },
    account: {
      provider: "google",
    },
  };
}

export function getEmail({
  from = "user@test.com",
  to = "user2@test.com",
  subject = "Test Subject",
  content = "Test content",
  replyTo,
  cc,
}: Partial<EmailForLLM> = {}): EmailForLLM {
  return {
    id: "email-id",
    from,
    to,
    subject,
    content,
    ...(replyTo && { replyTo }),
    ...(cc && { cc }),
  };
}

export function getRule(instructions: string, actions: Action[] = []) {
  return {
    instructions,
    name: "Joke requests",
    actions,
    id: "id",
    userId: "userId",
    createdAt: new Date(),
    updatedAt: new Date(),
    runOnThreads: false,
    groupId: null,
    from: null,
    subject: null,
    body: null,
    to: null,
    enabled: true,
    categoryFilterType: null,
    conditionalOperator: LogicalOperator.AND,
  };
}

export function getMockMessage({
  id = "msg1",
  threadId = "thread1",
  historyId = "12345",
  from = "test@example.com",
  to = "user@example.com",
  subject = "Test",
  snippet = "Test message",
  textPlain = "Test content",
  textHtml = "<p>Test content</p>",
}: {
  id?: string;
  threadId?: string;
  historyId?: string;
  from?: string;
  to?: string;
  subject?: string;
  snippet?: string;
  textPlain?: string;
  textHtml?: string;
} = {}) {
  return {
    id,
    threadId,
    historyId,
    headers: {
      from,
      to,
      subject,
      date: new Date().toISOString(),
    },
    snippet,
    textPlain,
    textHtml,
    attachments: [],
    inline: [],
    labelIds: [],
    subject,
    date: new Date().toISOString(),
  };
}

export function getMockExecutedRule({
  messageId = "msg1",
  threadId = "thread1",
  ruleId = "rule1",
  ruleName = "Test Rule",
}: {
  messageId?: string;
  threadId?: string;
  ruleId?: string;
  ruleName?: string;
} = {}): Prisma.ExecutedRuleGetPayload<{
  select: {
    messageId: true;
    threadId: true;
    rule: {
      select: {
        id: true;
        name: true;
      };
    };
  };
}> {
  return {
    messageId,
    threadId,
    rule: { id: ruleId, name: ruleName },
  };
}
