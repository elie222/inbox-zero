import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { UserAIFields } from "@/utils/llms/types";
import { withError } from "@/utils/middleware";
import { getAiProviderAndModel } from "@/utils/llms";
import { aiCreateRule } from "@/utils/ai/rule/create-rule";

const categorizeRuleBody = z.object({ ruleId: z.string() });
export type CategorizeRuleBody = z.infer<typeof categorizeRuleBody>;
export type CategorizeRuleResponse = Awaited<ReturnType<typeof categorizeRule>>;

// suggest actions to add to the rule
async function categorizeRule(
  body: CategorizeRuleBody,
  userId: string,
  userEmail: string,
  userAiFields: UserAIFields,
) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: { id: body.ruleId },
  });

  if (rule.userId !== userId) throw new Error("Unauthorized");

  // ask ai to categorize the rule
  const categorizedRule = await aiCreateRule(
    rule.instructions,
    userAiFields,
    userEmail,
  );

  if (!categorizedRule?.actions?.length) return;

  const actions = categorizedRule?.actions;

  // save the result to the rule
  const [, updatedRule] = await prisma.$transaction([
    prisma.action.deleteMany({
      where: {
        ruleId: body.ruleId,
      },
    }),
    prisma.rule.update({
      where: {
        id: body.ruleId,
      },
      data: {
        name: categorizedRule.name,
        actions: {
          createMany: {
            data: actions,
          },
        },
      },
      include: {
        actions: true,
      },
    }),
  ]);

  return updatedRule;
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categorizeRuleBody.parse(json);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const result = await categorizeRule(
    body,
    session.user.id,
    session.user.email,
    {
      aiProvider: provider,
      aiModel: model,
      openAIApiKey: user.openAIApiKey,
    },
  );

  return NextResponse.json(result);
});
