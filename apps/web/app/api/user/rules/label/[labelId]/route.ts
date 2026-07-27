import { z } from "zod";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ActionType } from "@/generated/prisma/enums";

const paramsSchema = z.object({ labelId: z.string().min(1) });

export type FolderRuleResponse = Awaited<ReturnType<typeof getFolderRule>>;

// The rule whose LABEL action files emails into this folder, if any.
// Older rules reference their label by name only, so match either.
async function getFolderRule({
  emailAccountId,
  labelId,
  labelName,
}: {
  emailAccountId: string;
  labelId: string;
  labelName?: string;
}) {
  const rule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      actions: {
        some: {
          type: ActionType.LABEL,
          OR: [{ labelId }, ...(labelName ? [{ label: labelName }] : [])],
        },
      },
    },
    select: {
      id: true,
      name: true,
      enabled: true,
      instructions: true,
      from: true,
      conditionalOperator: true,
      organizationRuleId: true,
      systemType: true,
      excludeKnownContacts: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return { rule };
}

export const maxDuration = 10;

export const GET = withEmailAccount(
  "user/rules/label",
  async (request, context) => {
    const emailAccountId = request.auth.emailAccountId;
    const params = paramsSchema.parse(await context.params);
    const { searchParams } = new URL(request.url);
    const labelName = searchParams.get("name") || undefined;

    const result = await getFolderRule({
      emailAccountId,
      labelId: decodeURIComponent(params.labelId),
      labelName,
    });

    return NextResponse.json(result);
  },
);
