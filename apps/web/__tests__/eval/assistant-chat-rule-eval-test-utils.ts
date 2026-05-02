import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import type { GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDefaultActions,
  getRuleConfig,
  SYSTEM_RULE_ORDER,
} from "@/utils/rule/consts";
import { vi } from "vitest";

type AnyMock = ReturnType<typeof vi.fn>;

type RuleGroupItem = {
  type: GroupItemType;
  value: string;
  exclude: boolean;
};

type RuleRow = ReturnType<typeof buildDefaultSystemRuleRows>[number];
type RuleMutationMocks = {
  mockCreateRule: AnyMock;
  mockPartialUpdateRule: AnyMock;
  mockUpdateRuleActions: AnyMock;
  mockSetRuleEnabled?: AnyMock;
};

export function buildDefaultSystemRuleRows(updatedAt: Date) {
  return SYSTEM_RULE_ORDER.map((systemType) => {
    const config = getRuleConfig(systemType);

    return {
      id: `${systemType.toLowerCase()}-rule-id`,
      name: config.name,
      instructions: config.instructions,
      updatedAt,
      from: null,
      to: null,
      subject: null,
      conditionalOperator: LogicalOperator.AND,
      enabled: true,
      runOnThreads: config.runOnThreads,
      systemType,
      actions: getDefaultActions(systemType, "google").map((action) => ({
        type: action.type,
        content: action.content,
        label: action.label,
        to: action.to,
        cc: action.cc,
        bcc: action.bcc,
        subject: action.subject,
        url: action.url,
        folderName: action.folderName,
      })),
    };
  });
}

export function buildDefaultRuleLabels(ruleRows: RuleRow[]) {
  return ruleRows.flatMap((rule) =>
    rule.actions
      .filter((action) => action.type === ActionType.LABEL && action.label)
      .map((action) => ({
        id: `Label_${action.label}`,
        name: action.label!,
      })),
  );
}

export function configureRuleMutationMocks({
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSaveLearnedPatterns,
  mockSetRuleEnabled,
}: {
  mockCreateRule: AnyMock;
  mockPartialUpdateRule: AnyMock;
  mockUpdateRuleActions: AnyMock;
  mockSaveLearnedPatterns: AnyMock;
  mockSetRuleEnabled?: AnyMock;
}) {
  mockCreateRule.mockResolvedValue({ id: "created-rule-id" });
  mockPartialUpdateRule.mockResolvedValue({ id: "updated-rule-id" });
  mockUpdateRuleActions.mockResolvedValue({ id: "updated-rule-id" });
  mockSaveLearnedPatterns.mockResolvedValue({ success: true });
  mockSetRuleEnabled?.mockResolvedValue({ id: "updated-rule-id" });
}

export function configureRuleEvalPrisma({
  about,
  ruleRows,
  groupItemsByRuleName,
}: {
  about: string;
  ruleRows: RuleRow[];
  groupItemsByRuleName?: Record<string, RuleGroupItem[]>;
}) {
  const defaultRuleRowsByName = new Map(
    ruleRows.map((rule) => [rule.name, rule] as const),
  );

  prisma.emailAccount.findUnique.mockImplementation(async ({ select }) => {
    if (select?.rules) {
      return {
        about,
        rulesRevision: 1,
        rules: ruleRows,
      };
    }

    return {
      about,
    };
  });

  prisma.emailAccount.update.mockResolvedValue({ about });

  prisma.rule.findUnique.mockImplementation(async ({ where, select }) => {
    const ruleName = where?.name_emailAccountId?.name;
    if (!ruleName) return null;

    if (select?.group) {
      return {
        group: {
          items: groupItemsByRuleName?.[ruleName] ?? [],
        },
      };
    }

    const matchedRule = defaultRuleRowsByName.get(ruleName);
    if (!matchedRule) return null;

    return {
      ...matchedRule,
      emailAccount: {
        rulesRevision: 1,
      },
    };
  });

  prisma.rule.findMany.mockImplementation(async ({ select }) => {
    if (
      select?.name &&
      select?.from &&
      select?.to &&
      select?.subject &&
      select?.enabled
    ) {
      return ruleRows.map((rule) => ({
        name: rule.name,
        enabled: rule.enabled,
        instructions: rule.instructions,
        from: rule.from,
        to: rule.to,
        subject: rule.subject,
        group: {
          items: groupItemsByRuleName?.[rule.name] ?? [],
        },
      }));
    }

    return ruleRows;
  });
}

export function configureRuleEvalProvider({
  mockCreateEmailProvider,
  ruleRows,
  includeCreateLabel = false,
}: {
  mockCreateEmailProvider: AnyMock;
  ruleRows: RuleRow[];
  includeCreateLabel?: boolean;
}) {
  const labels = buildDefaultRuleLabels(ruleRows);
  const provider = {
    getMessagesWithPagination: vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    }),
    searchMessages: vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    }),
    getLabels: vi.fn().mockResolvedValue(labels),
    archiveThreadWithLabel: vi.fn(),
    markReadThread: vi.fn(),
    bulkArchiveFromSenders: vi.fn(),
    ...(includeCreateLabel
      ? {
          createLabel: vi.fn(async (name: string) => ({
            id: `label-${name.toLowerCase().replace(/\s+/g, "-")}`,
            name,
            type: "user",
          })),
        }
      : {}),
  };

  mockCreateEmailProvider.mockResolvedValue(provider);
}

export function senderListMatchesExactly(
  senderList: string,
  expectedSenders: string[],
) {
  const normalizedValues = splitSenderValues(senderList).sort();
  const normalizedExpected = expectedSenders.map(normalizeSender).sort();

  if (normalizedValues.length !== normalizedExpected.length) return false;

  return normalizedExpected.every(
    (expectedSender, index) => normalizedValues[index] === expectedSender,
  );
}

export function senderListHasValue(senderList: string, expectedSender: string) {
  return splitSenderValues(senderList).includes(
    normalizeSender(expectedSender),
  );
}

export async function buildRuleModuleMutationMock({
  importOriginal,
  mockCreateRule,
  mockPartialUpdateRule,
  mockUpdateRuleActions,
  mockSetRuleEnabled,
}: RuleMutationMocks & {
  importOriginal: () => Promise<typeof import("@/utils/rule/rule")>;
}) {
  const actual = await importOriginal();

  return {
    ...actual,
    createRule: mockCreateRule,
    partialUpdateRule: mockPartialUpdateRule,
    updateRuleActions: mockUpdateRuleActions,
    ...(mockSetRuleEnabled ? { setRuleEnabled: mockSetRuleEnabled } : {}),
  };
}

function normalizeSender(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function splitSenderValues(value: string) {
  return value
    .split(/[|,\n]/)
    .map((part) => normalizeSender(part))
    .filter(Boolean);
}
