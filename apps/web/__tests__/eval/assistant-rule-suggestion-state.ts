import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import type prismaMock from "@/utils/__mocks__/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { DemoInboxFixture } from "@/__tests__/fixtures/inboxes/types";
import {
  buildRuleRow,
  searchFixtureMessages,
  toFixtureLabelRows,
  toMockMessages,
  toRuleRows,
  type DemoInboxRuleRow,
} from "@/__tests__/fixtures/inboxes/adapters";

type AssistantRuleSuggestionState = {
  fixture: DemoInboxFixture;
  account: {
    email: string;
    timezone: string;
    about: string;
  };
  labels: ReturnType<typeof toFixtureLabelRows>;
  rules: DemoInboxRuleRow[];
  rulesRevision: number;
  createdRules: DemoInboxRuleRow[];
  searchQueries: string[];
  provider: EmailProvider;
};

type CreateRuleMockArgs = {
  result: CreateOrUpdateRuleSchema;
  runOnThreads: boolean;
};

type UpdateRuleActionsMockArgs = {
  ruleId: string;
  actions: CreateOrUpdateRuleSchema["actions"];
};

type PartialUpdateRuleMockArgs = {
  ruleId: string;
  data: Partial<DemoInboxRuleRow>;
};

export function createAssistantRuleSuggestionState({
  fixture,
  account = {
    email: fixture.mailbox.email,
    timezone: fixture.mailbox.timezone,
    about: "Not set",
  },
  rules = toRuleRows({}),
}: {
  fixture: DemoInboxFixture;
  account?: {
    email: string;
    timezone: string;
    about: string;
  };
  rules?: DemoInboxRuleRow[];
}): AssistantRuleSuggestionState {
  const state: AssistantRuleSuggestionState = {
    fixture,
    account,
    labels: toFixtureLabelRows(fixture),
    rules: rules.map(cloneRuleRow),
    rulesRevision: 1,
    createdRules: [],
    searchQueries: [],
    provider: {} as EmailProvider,
  };

  state.provider = createProviderMock(state);

  return state;
}

export function configurePrismaForAssistantRuleSuggestionState({
  prisma,
  state,
}: {
  prisma: typeof prismaMock;
  state: AssistantRuleSuggestionState;
}) {
  prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
    if (select?.rulesRevision && !select?.rules) {
      return { rulesRevision: state.rulesRevision };
    }

    if (select?.rules) {
      return {
        about: state.account.about,
        rulesRevision: state.rulesRevision,
        rules: state.rules,
      };
    }

    if (select?.email) {
      return {
        email: state.account.email,
        timezone: state.account.timezone,
        meetingBriefingsEnabled: false,
        meetingBriefingsMinutesBefore: 15,
        meetingBriefsSendEmail: false,
        filingEnabled: false,
        filingPrompt: null,
        filingFolders: [],
        driveConnections: [],
      };
    }

    return {
      about: state.account.about,
    };
  });

  prisma.emailAccount.update.mockResolvedValue({
    about: state.account.about,
  });

  prisma.rule.findUnique.mockImplementation(async ({ where, select }) => {
    const ruleName = where?.name_emailAccountId?.name;
    const ruleId = where?.id;
    const rule = state.rules.find(
      (candidate) => candidate.name === ruleName || candidate.id === ruleId,
    );

    if (!rule) return null;

    if (select?.group) {
      return {
        ...rule,
        group: { items: [] },
      };
    }

    return {
      ...rule,
      emailAccount: { rulesRevision: state.rulesRevision },
    };
  });

  prisma.rule.findMany.mockImplementation(async () =>
    state.rules.map((rule) => ({
      ...rule,
      group: { items: [] },
    })),
  );
}

export async function createRuleInAssistantState(
  state: AssistantRuleSuggestionState,
  { result, runOnThreads }: CreateRuleMockArgs,
) {
  const rule = buildRuleRow({
    name: result.name,
    instructions: result.condition.aiInstructions ?? null,
    from: result.condition.static?.from ?? null,
    to: result.condition.static?.to ?? null,
    subject: result.condition.static?.subject ?? null,
    conditionalOperator: result.condition.conditionalOperator ?? undefined,
    actions: result.actions.map((action) => ({
      type: action.type,
      content: action.fields?.content ?? null,
      label: action.fields?.label ?? null,
      to: action.fields?.to ?? null,
      cc: action.fields?.cc ?? null,
      bcc: action.fields?.bcc ?? null,
      subject: action.fields?.subject ?? null,
      url: action.fields?.webhookUrl ?? null,
      folderName: action.fields?.folderName ?? null,
      delayInMinutes: action.delayInMinutes ?? null,
    })),
    runOnThreads,
  });

  state.rules.push(rule);
  state.createdRules.push(rule);
  state.rulesRevision += 1;

  return { id: rule.id };
}

export async function updateRuleActionsInAssistantState(
  state: AssistantRuleSuggestionState,
  { ruleId, actions }: UpdateRuleActionsMockArgs,
) {
  const rule = state.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return { id: ruleId };

  rule.actions = actions.map((action) => ({
    type: action.type,
    content: action.fields?.content ?? null,
    label: action.fields?.label ?? null,
    to: action.fields?.to ?? null,
    cc: action.fields?.cc ?? null,
    bcc: action.fields?.bcc ?? null,
    subject: action.fields?.subject ?? null,
    url: action.fields?.webhookUrl ?? null,
    folderName: action.fields?.folderName ?? null,
    delayInMinutes: action.delayInMinutes ?? null,
  }));
  rule.updatedAt = new Date();
  state.rulesRevision += 1;

  return { id: rule.id };
}

export async function partialUpdateRuleInAssistantState(
  state: AssistantRuleSuggestionState,
  { ruleId, data }: PartialUpdateRuleMockArgs,
) {
  const rule = state.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) return { id: ruleId };

  Object.assign(rule, data, { updatedAt: new Date() });
  state.rulesRevision += 1;

  return { id: rule.id };
}

function cloneRuleRow(rule: DemoInboxRuleRow): DemoInboxRuleRow {
  return {
    ...rule,
    updatedAt: new Date(rule.updatedAt),
    actions: rule.actions.map((action) => ({ ...action })),
  };
}

function createProviderMock(
  state: AssistantRuleSuggestionState,
): EmailProvider {
  const messages = toMockMessages(state.fixture);
  const messageById = new Map(messages.map((message) => [message.id, message]));

  return {
    searchMessages: async ({ query, maxResults, pageToken }) => {
      state.searchQueries.push(query);
      return searchFixtureMessages({
        fixture: state.fixture,
        query,
        maxResults,
        pageToken,
      });
    },
    getLabels: async () => state.labels,
    createLabel: async (name) => {
      const label = {
        id: `Label_${name}`,
        name,
        type: "user" as const,
      };
      state.labels.push(label);
      return label;
    },
    getMessage: async (messageId) => {
      const message = messageById.get(messageId);
      if (!message) throw new Error(`Unexpected messageId: ${messageId}`);
      return message;
    },
    getMessagesWithPagination: async ({ maxResults = 20, pageToken }) => {
      const offset = pageToken ? Number.parseInt(pageToken, 10) || 0 : 0;
      const page = messages.slice(offset, offset + maxResults);
      const nextOffset = offset + page.length;

      return {
        messages: page,
        nextPageToken:
          nextOffset < messages.length ? String(nextOffset) : undefined,
      };
    },
    getInboxStats: async () => ({
      total: messages.length,
      unread: messages.filter((message) => message.labelIds.includes("UNREAD"))
        .length,
    }),
    archiveThreadWithLabel: async () => undefined,
    markReadThread: async () => undefined,
    bulkArchiveFromSenders: async () => undefined,
  } as Partial<EmailProvider> as EmailProvider;
}
