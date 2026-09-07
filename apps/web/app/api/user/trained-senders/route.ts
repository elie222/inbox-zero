import { NextResponse } from "next/server";
import { ActionType, GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type TrainedSendersResponse = Awaited<
  ReturnType<typeof getTrainedSenders>
>;

// Every learned FROM pattern across the account's rules, with the label the
// rule applies, so the user can see "sender -> label" in one place.
async function getTrainedSenders({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const items = await prisma.groupItem.findMany({
    where: {
      type: GroupItemType.FROM,
      group: { emailAccountId, rule: { isNot: null } },
    },
    select: {
      id: true,
      value: true,
      exclude: true,
      source: true,
      reason: true,
      createdAt: true,
      group: {
        select: {
          rule: {
            select: {
              id: true,
              name: true,
              enabled: true,
              actions: {
                where: { type: ActionType.LABEL },
                select: { label: true },
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const senders = items.flatMap((item) => {
    const rule = item.group?.rule;
    if (!rule) return [];
    return [
      {
        id: item.id,
        sender: item.value,
        exclude: item.exclude,
        source: item.source,
        reason: item.reason,
        createdAt: item.createdAt,
        rule: {
          id: rule.id,
          name: rule.name,
          enabled: rule.enabled,
          label: rule.actions[0]?.label ?? null,
        },
      },
    ];
  });

  return { senders };
}

export const GET = withEmailAccount("user/trained-senders", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getTrainedSenders({ emailAccountId });
  return NextResponse.json(result);
});
