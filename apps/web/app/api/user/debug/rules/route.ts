import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type DebugRulesResponse = Awaited<ReturnType<typeof getDebugRules>>;

export const GET = withEmailAccount("user/debug/rules", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getDebugRules({ emailAccountId });
  return NextResponse.json(result);
});

async function getDebugRules({ emailAccountId }: { emailAccountId: string }) {
  const rules = await prisma.rule.findMany({
    where: { emailAccountId },
    include: {
      actions: true,
      group: {
        select: {
          id: true,
          name: true,
          _count: {
            select: { items: true },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    automate: rule.automate,
    runOnThreads: rule.runOnThreads,
    conditionalOperator: rule.conditionalOperator,
    systemType: rule.systemType,
    instructions: rule.instructions,
    from: rule.from,
    to: rule.to,
    subject: rule.subject,
    body: rule.body,
    promptText: rule.promptText,
    actions: rule.actions.map((action) => ({
      id: action.id,
      type: action.type,
      label: action.label,
      labelId: action.labelId,
      subject: action.subject,
      content: action.content,
      to: action.to,
      cc: action.cc,
      bcc: action.bcc,
      url: action.url,
      folderName: action.folderName,
      folderId: action.folderId,
      delayInMinutes: action.delayInMinutes,
    })),
    learnedPatternsCount: rule.group?._count.items ?? 0,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  }));
}
