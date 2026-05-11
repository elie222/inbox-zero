import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import type { Action, Prisma } from "@/generated/prisma/client";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { createScopedLogger } from "@/utils/logger";

export function createTestLogger() {
  return createScopedLogger("test");
}

type WithErrorTestHandler<TContext extends unknown[]> = (
  request: Request,
  ...context: TContext
) => Promise<Response>;

type TestRequestWithLogger = Request & {
  logger: ReturnType<typeof createTestLogger>;
};

type TestAuth = {
  userId: string;
};

type TestEmailAccountAuth = {
  email: string;
  emailAccountId: string;
  userId: string;
};

type TestMiddlewareHandler = (
  request: Request,
  ...context: unknown[]
) => Promise<Response>;

type TestSafeErrorOptions = {
  handleSafeErrors?: boolean;
};

export function createWithErrorTestMiddleware({
  logger = createTestLogger(),
  handleSafeErrors = false,
}: {
  logger?: ReturnType<typeof createTestLogger>;
  handleSafeErrors?: boolean;
} = {}) {
  const wrap =
    <TContext extends unknown[]>(handler: WithErrorTestHandler<TContext>) =>
    async (request: Request, ...context: TContext) => {
      (request as TestRequestWithLogger).logger = logger;
      return runTestMiddlewareHandler(
        () => handler(request, ...context),
        handleSafeErrors,
      );
    };

  return {
    withError: <TContext extends unknown[]>(
      scopeOrHandler: string | WithErrorTestHandler<TContext>,
      handler?: WithErrorTestHandler<TContext>,
    ) => wrap(typeof scopeOrHandler === "string" ? handler! : scopeOrHandler),
  };
}

export function createWithAuthTestMiddleware(
  options?: Parameters<typeof addTestAuth>[1] & TestSafeErrorOptions,
) {
  return { withAuth: createAuthTestMiddlewareWrapper(options) };
}

export function createWithAdminTestMiddleware(
  options?: Parameters<typeof addTestAuth>[1] & TestSafeErrorOptions,
) {
  return { withAdmin: createAuthTestMiddlewareWrapper(options) };
}

export function createWithEmailAccountTestMiddleware(
  options?: Parameters<typeof addTestEmailAccountAuth>[1] &
    TestSafeErrorOptions,
) {
  const { handleSafeErrors = false, ...authOptions } = options ?? {};

  const wrap =
    (handler: TestMiddlewareHandler) =>
    async (request: Request, ...context: unknown[]) =>
      runTestMiddlewareHandler(
        () =>
          handler(addTestEmailAccountAuth(request, authOptions), ...context),
        handleSafeErrors,
      );

  return {
    withEmailAccount: (
      scopeOrHandler: string | TestMiddlewareHandler,
      handler?: TestMiddlewareHandler,
    ) => wrap(typeof scopeOrHandler === "string" ? handler! : scopeOrHandler),
  };
}

export function addTestAuth<TRequest extends Request>(
  request: TRequest,
  {
    auth = {
      userId: "user-1",
    },
    logger = createTestLogger(),
  }: {
    auth?: TestAuth;
    logger?: ReturnType<typeof createTestLogger>;
  } = {},
) {
  return Object.assign(request, { auth, logger });
}

export function addTestEmailAccountAuth<TRequest extends Request>(
  request: TRequest,
  {
    auth = {
      userId: "user-1",
      emailAccountId: "email-account-1",
      email: "user@example.com",
    },
    logger = createTestLogger(),
  }: {
    auth?: TestEmailAccountAuth;
    logger?: ReturnType<typeof createTestLogger>;
  } = {},
) {
  return Object.assign(request, { auth, logger });
}

function createAuthTestMiddlewareWrapper(
  options?: Parameters<typeof addTestAuth>[1] & TestSafeErrorOptions,
) {
  const { handleSafeErrors = false, ...authOptions } = options ?? {};

  const wrap =
    (handler: TestMiddlewareHandler) =>
    async (request: Request, ...context: unknown[]) =>
      runTestMiddlewareHandler(
        () => handler(addTestAuth(request, authOptions), ...context),
        handleSafeErrors,
      );

  return (
    scopeOrHandler: string | TestMiddlewareHandler,
    handler?: TestMiddlewareHandler,
  ) => wrap(typeof scopeOrHandler === "string" ? handler! : scopeOrHandler);
}

async function runTestMiddlewareHandler(
  handler: () => Promise<Response>,
  handleSafeErrors: boolean,
) {
  try {
    return await handler();
  } catch (error) {
    const response = handleSafeErrors ? getSafeErrorTestResponse(error) : null;
    if (response) return response;

    throw error;
  }
}

function getSafeErrorTestResponse(error: unknown) {
  if (!(error instanceof Error) || error.name !== "SafeError") return null;

  const safeError = error as Error & {
    safeMessage?: string;
    statusCode?: number;
  };

  return Response.json(
    { error: safeError.safeMessage, isKnownError: true },
    { status: safeError.statusCode ?? 400 },
  );
}

type EmailAccountSelect = {
  id: string;
  email: string;
  accountId: string;
  userId?: string;
  name?: string | null;
};

type UserSelect = {
  email: string;
  id?: string;
  name?: string | null;
};

type AccountWithEmailAccount = {
  id: string;
  userId: string;
  emailAccount?: { id: string } | null;
};

export function getEmailAccount(
  overrides: Partial<EmailAccountWithAI> = {},
): EmailAccountWithAI {
  return {
    id: "email-account-id",
    userId: "user1",
    email: overrides.email || "user@test.com",
    about: null,
    multiRuleSelectionEnabled: overrides.multiRuleSelectionEnabled ?? false,
    sensitiveDataPolicy: overrides.sensitiveDataPolicy ?? "ALLOW",
    timezone: null,
    calendarBookingLink: null,
    draftReplyConfidence: overrides.draftReplyConfidence ?? "MEDIUM",
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

/**
 * Helper to generate sequential dates for email threads.
 * Each date is hoursApart hours after the previous one.
 * @param count - Number of dates to generate
 * @param hoursApart - Hours between each message (default: 1)
 * @param startDate - Starting date (default: 7 days ago)
 */
export function generateSequentialDates(
  count: number,
  hoursApart = 1,
  startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
): Date[] {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(startDate);
    date.setHours(date.getHours() + i * hoursApart);
    return date;
  });
}

export function getEmail({
  from = "user@test.com",
  to = "user2@test.com",
  subject = "Test Subject",
  content = "Test content",
  replyTo,
  cc,
  date,
  listUnsubscribe,
}: Partial<EmailForLLM> = {}): EmailForLLM {
  return {
    id: "email-id",
    from,
    to,
    subject,
    content,
    ...(replyTo && { replyTo }),
    ...(cc && { cc }),
    ...(date && { date }),
    ...(listUnsubscribe && { listUnsubscribe }),
  };
}

export function getMockEmailProvider({
  unread = 0,
  total = 0,
  inboxMessages = [],
}: {
  unread?: number;
  total?: number;
  inboxMessages?: Awaited<ReturnType<EmailProvider["getInboxMessages"]>>;
} = {}): EmailProvider {
  return {
    getInboxStats: async () => ({ unread, total }),
    getInboxMessages: async () => inboxMessages,
  } as Pick<
    EmailProvider,
    "getInboxStats" | "getInboxMessages"
  > as EmailProvider;
}

export function getRule(
  instructions: string,
  actions: Action[] = [],
  name?: string,
) {
  return {
    instructions,
    name: name || "Joke requests",
    actions,
    id: "id",
    userId: "userId",
    emailAccountId: "emailAccountId",
    createdAt: new Date(),
    updatedAt: new Date(),
    automate: true,
    runOnThreads: false,
    groupId: null,
    from: null,
    subject: null,
    body: null,
    to: null,
    enabled: true,
    categoryFilterType: null,
    conditionalOperator: LogicalOperator.AND,
    systemType: null,
    promptText: null,
  };
}

export function getAction(overrides: Partial<Action> = {}): Action {
  return {
    id: "action-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    type: overrides.type ?? ActionType.LABEL,
    ruleId: "rule-id",
    to: null,
    subject: null,
    label: null,
    labelId: null,
    content: null,
    cc: null,
    bcc: null,
    url: null,
    folderName: null,
    folderId: null,
    messagingChannelId: null,
    delayInMinutes: null,
    staticAttachments: null,
    ...overrides,
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
  labelIds = [],
  attachments = [],
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
  labelIds?: string[];
  attachments?: any[];
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
    attachments,
    inline: [],
    labelIds,
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

export function getMockEmailAccountSelect(
  overrides: Partial<EmailAccountSelect> = {},
): EmailAccountSelect {
  return {
    id: overrides.id || "email-account-id",
    email: overrides.email || "test@example.com",
    accountId: overrides.accountId || "account-id",
    userId: overrides.userId || "user-id",
    name: overrides.name !== undefined ? overrides.name : "Test User",
  };
}

export function getMockUserSelect(
  overrides: Partial<UserSelect> = {},
): UserSelect {
  return {
    email: overrides.email || "test@example.com",
    id: overrides.id || "user-id",
    name: overrides.name !== undefined ? overrides.name : "Test User",
  };
}

export function getMockAccountWithEmailAccount(
  overrides: Partial<AccountWithEmailAccount> = {},
): AccountWithEmailAccount {
  return {
    id: overrides.id || "account-id",
    userId: overrides.userId || "user-id",
    emailAccount:
      overrides.emailAccount !== undefined
        ? overrides.emailAccount
        : { id: "email-account-id" },
  };
}

export function getMockEmailAccountWithAccount({
  id = "email-account-id",
  email = "test@example.com",
  userId = "user1",
  provider = "google",
}: {
  id?: string;
  email?: string;
  userId?: string;
  provider?: string;
} = {}) {
  return {
    id,
    email,
    account: { userId, provider },
  };
}

export function getCalendarConnection({
  provider = "google",
  calendarIds = ["cal-1"],
  emailAccountId = "test-account-id",
}: {
  provider?: "google" | "microsoft";
  calendarIds?: string[];
  emailAccountId?: string;
} = {}): Prisma.CalendarConnectionGetPayload<{
  include: {
    calendars: {
      where: { isEnabled: true };
      select: { calendarId: true };
    };
  };
}> {
  return {
    id: `conn-${provider}`,
    provider,
    email: `test@${isGoogleProvider(provider) ? "gmail" : "outlook"}.com`,
    accessToken: "token",
    refreshToken: "refresh",
    expiresAt: new Date(),
    isConnected: true,
    emailAccountId,
    createdAt: new Date(),
    updatedAt: new Date(),
    calendars: calendarIds.map((id) => ({ calendarId: id })),
  };
}
