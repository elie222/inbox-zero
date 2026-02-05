import prisma from "@/utils/prisma";
import type { TargetGroupCardinality } from "@/generated/prisma/enums";

export type AgentSystemData = {
  allowedActions: Array<{ actionType: string; resourceType: string | null }>;
  allowedActionOptions: Array<{
    actionType: string;
    name: string;
    targetGroup?: {
      name: string;
      cardinality: TargetGroupCardinality | null;
    } | null;
  }>;
  skills: Array<{ name: string; description: string }>;
};

export async function getAgentSystemData({
  emailAccountId,
}: {
  emailAccountId: string;
}): Promise<AgentSystemData> {
  const [allowedActions, allowedActionOptions, skills] = await Promise.all([
    prisma.allowedAction.findMany({
      where: { emailAccountId, enabled: true },
      select: { actionType: true, resourceType: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.allowedActionOption.findMany({
      where: { emailAccountId },
      select: {
        actionType: true,
        name: true,
        targetGroup: {
          select: { name: true, cardinality: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.skill.findMany({
      where: { emailAccountId, status: "ACTIVE" },
      select: { name: true, description: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    allowedActions,
    allowedActionOptions,
    skills,
  };
}
