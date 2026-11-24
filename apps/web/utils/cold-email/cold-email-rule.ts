import prisma from "@/utils/prisma";
import {
  GroupItemSource,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";

export type ColdEmailRule = NonNullable<
  Awaited<ReturnType<typeof getColdEmailRule>>
>;

export async function getColdEmailRule(emailAccountId: string) {
  const coldEmailRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType: SystemType.COLD_EMAIL,
      },
    },
    select: {
      id: true,
      enabled: true,
      instructions: true,
      groupId: true,
      actions: {
        select: {
          type: true,
          label: true,
          labelId: true,
        },
      },
    },
  });

  return coldEmailRule;
}

export function isColdEmailRuleEnabled(coldEmailRule: ColdEmailRule) {
  return !!coldEmailRule.enabled && coldEmailRule.actions.length > 0;
}

export function getColdEmailFeedbackSenderWhere(
  groupId: string,
  senderId: string,
) {
  return {
    id: senderId,
    groupId,
    type: GroupItemType.FROM,
    // Let a user retry label cleanup after the exclusion was saved.
    OR: [{ exclude: false }, { exclude: true, source: GroupItemSource.USER }],
  };
}
