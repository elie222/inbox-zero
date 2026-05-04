import type { ModelMessage } from "ai";
import {
  type ActionType,
  type LogicalOperator,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import { filterNullProperties } from "@/utils";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import prisma from "@/utils/prisma";

export type RuleReadState = {
  readAt: number;
  rulesRevision: number;
  ruleUpdatedAtByName: Map<string, string>;
};

export type AssistantRuleSnapshot = {
  rulesRevision: number;
  about: string;
  rules: Array<{
    name: string;
    updatedAt: string;
    conditions: {
      aiInstructions: string | null;
      static?: Partial<{
        from: string | null;
        to: string | null;
        subject: string | null;
      }>;
      conditionalOperator?: LogicalOperator;
    };
    actions: Array<{
      type: ActionType;
      fields: Partial<{
        label: string | null;
        content: string | null;
        to: string | null;
        cc: string | null;
        bcc: string | null;
        subject: string | null;
        webhookUrl: string | null;
        folderName: string | null;
      }>;
      delayInMinutes?: number | null;
    }>;
    enabled: boolean;
    runOnThreads: boolean;
  }>;
  ruleNotificationDestinations: Array<{ provider: string }>;
};

export async function loadAssistantRuleSnapshot({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<AssistantRuleSnapshot> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      about: true,
      rulesRevision: true,
      rules: {
        select: {
          name: true,
          instructions: true,
          updatedAt: true,
          from: true,
          to: true,
          subject: true,
          conditionalOperator: true,
          enabled: true,
          runOnThreads: true,
          actions: {
            select: {
              type: true,
              content: true,
              label: true,
              to: true,
              cc: true,
              bcc: true,
              subject: true,
              url: true,
              folderName: true,
              delayInMinutes: true,
            },
          },
        },
      },
      messagingChannels: {
        where: {
          isConnected: true,
          routes: {
            some: {
              purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            },
          },
        },
        select: {
          provider: true,
        },
      },
    },
  });

  const ruleNotificationDestinations = Array.from(
    new Set(
      (emailAccount?.messagingChannels ?? []).map((channel) =>
        getMessagingProviderName(channel.provider),
      ),
    ),
  ).map((provider) => ({ provider }));

  return {
    rulesRevision: emailAccount?.rulesRevision ?? 0,
    about: emailAccount?.about || "Not set",
    ruleNotificationDestinations,
    rules: (emailAccount?.rules || []).map((rule) => {
      const staticConditions = filterNullProperties({
        from: rule.from,
        to: rule.to,
        subject: rule.subject,
      });

      return {
        name: rule.name,
        updatedAt: rule.updatedAt.toISOString(),
        conditions: {
          aiInstructions: rule.instructions,
          static:
            Object.keys(staticConditions).length > 0
              ? staticConditions
              : undefined,
          conditionalOperator:
            rule.instructions && Object.keys(staticConditions).length > 0
              ? rule.conditionalOperator
              : undefined,
        },
        actions: rule.actions.map((action) => ({
          type: action.type,
          fields: filterNullProperties({
            label: action.label,
            content: action.content,
            to: action.to,
            cc: action.cc,
            bcc: action.bcc,
            subject: action.subject,
            webhookUrl: action.url,
            folderName: action.folderName,
          }),
          delayInMinutes: action.delayInMinutes,
        })),
        enabled: rule.enabled,
        runOnThreads: rule.runOnThreads,
      };
    }),
  };
}

export async function loadCurrentRulesRevision({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { rulesRevision: true },
  });

  return emailAccount?.rulesRevision ?? 0;
}

export function buildRuleReadState(
  snapshot: AssistantRuleSnapshot,
): RuleReadState {
  return {
    readAt: Date.now(),
    rulesRevision: snapshot.rulesRevision,
    ruleUpdatedAtByName: new Map(
      snapshot.rules.map((rule) => [rule.name, rule.updatedAt]),
    ),
  };
}

export function buildFreshRuleContextMessage(
  snapshot: AssistantRuleSnapshot,
): ModelMessage {
  return {
    role: "user",
    content:
      "[Fresh rule state update — not a message from the user] Rule-related settings changed since this chat last saw them. Use this as the latest source of truth.\n\n```json\n" +
      JSON.stringify(
        {
          personalInstructions: snapshot.about,
          rulesRevision: snapshot.rulesRevision,
          ruleNotificationDestinations: snapshot.ruleNotificationDestinations,
          rules: snapshot.rules.map(stripRuleUpdatedAt),
        },
        null,
        2,
      ) +
      "\n```",
  };
}

export function getVisibleRulesFromSnapshot(snapshot: AssistantRuleSnapshot) {
  return snapshot.rules.map(stripRuleUpdatedAt);
}

function stripRuleUpdatedAt(
  rule: AssistantRuleSnapshot["rules"][number],
): Omit<AssistantRuleSnapshot["rules"][number], "updatedAt"> {
  const { updatedAt: _updatedAt, ...visibleRule } = rule;
  return visibleRule;
}
