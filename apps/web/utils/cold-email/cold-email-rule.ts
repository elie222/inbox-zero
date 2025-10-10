import prisma from "@/utils/prisma";
import { SystemType } from "@prisma/client";

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
