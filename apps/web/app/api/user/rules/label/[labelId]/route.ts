import { z } from "zod";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ActionType } from "@/generated/prisma/enums";

const paramsSchema = z.object({ labelId: z.string().min(1) });

export type FolderRuleResponse = Awaited<ReturnType<typeof getFolderRule>>;

// The rule whose filing action (label or folder move) files emails into
// this folder, if any. Older rules reference their label by name only, so
// match either.
async function getFolderRule({
  emailAccountId,
  labelId,
  labelName,
}: {
  emailAccountId: string;
  labelId: string;
  labelName?: string;
}) {
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      actions: {
        some: {
          OR: [
            {
              type: ActionType.LABEL,
              OR: [{ labelId }, ...(labelName ? [{ label: labelName }] : [])],
            },
            {
              type: ActionType.MOVE_FOLDER,
              OR: [
                { folderId: labelId },
                ...(labelName ? [{ folderName: labelName }] : []),
              ],
            },
          ],
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
    // The rule that is actually filing right now is the one the drawer's
    // toggle must control — an enabled rule always wins over a disabled
    // sibling filing into the same folder
    orderBy: [{ enabled: "desc" }, { createdAt: "asc" }],
  });

  const [rule, ...others] = rules;

  return {
    rule: rule ?? null,
    // Surface siblings so turning off "the" rule can't silently leave
    // another one filing into the same folder
    otherRuleNames: others.map((other) => other.name),
  };
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
