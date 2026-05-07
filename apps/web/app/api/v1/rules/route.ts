import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAccountApiKey } from "@/utils/api-middleware";
import { createRule } from "@/utils/rule/rule";
import { toRuleWriteInput } from "@/app/api/v1/rules/request";
import { apiRuleSelect, serializeRule } from "@/app/api/v1/rules/serializers";
import { ruleRequestBodySchema } from "@/app/api/v1/rules/validation";
import { assertCanUseDigestsIfNeeded } from "@/utils/premium/server";

export const GET = withAccountApiKey(
  "v1/rules",
  ["RULES_READ"],
  async (request) => {
    const { emailAccountId } = request.apiAuth;

    const rules = await prisma.rule.findMany({
      where: { emailAccountId },
      select: apiRuleSelect,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      rules: rules.map(serializeRule),
    });
  },
);

export const POST = withAccountApiKey(
  "v1/rules",
  ["RULES_WRITE"],
  async (request) => {
    const { emailAccountId, provider, userId } = request.apiAuth;
    const body = ruleRequestBodySchema.parse(await request.json());
    const ruleInput = toRuleWriteInput(body);

    await assertCanUseDigestsIfNeeded(userId, ruleInput.actions);

    const createdRule = await createRule({
      result: {
        name: ruleInput.name,
        condition: ruleInput.condition,
        actions: ruleInput.actions,
      },
      emailAccountId,
      provider,
      runOnThreads: ruleInput.runOnThreads,
      logger: request.logger,
    });

    const rule = await prisma.rule.findUnique({
      where: { id: createdRule.id, emailAccountId },
      select: apiRuleSelect,
    });

    if (!rule) {
      throw new Error("Created rule could not be loaded");
    }

    return NextResponse.json({ rule: serializeRule(rule) }, { status: 201 });
  },
);
