import { NextResponse } from "next/server";
import { ActionType, GroupItemType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

const LIMIT = 50;

export type TrainedSendersResponse = Awaited<
  ReturnType<typeof getTrainedSenders>
>;

// One row per sender across all of the account's rules: the rules it is
// trained into (with the label each applies) and the rules it is excluded
// from. Paginated by sender, newest first.
async function getTrainedSenders({
  emailAccountId,
  page,
  query,
}: {
  emailAccountId: string;
  page: number;
  query: string;
}) {
  const where: Prisma.GroupItemWhereInput = {
    type: GroupItemType.FROM,
    group: { emailAccountId, rule: { isNot: null } },
    ...(query ? { value: { contains: query, mode: "insensitive" } } : {}),
  };

  const [pageSenders, allSenders] = await Promise.all([
    prisma.groupItem.groupBy({
      by: ["value"],
      where,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: LIMIT,
      skip: (page - 1) * LIMIT,
    }),
    prisma.groupItem.groupBy({ by: ["value"], where }),
  ]);

  const values = pageSenders.map((s) => s.value);

  const items = values.length
    ? await prisma.groupItem.findMany({
        where: { ...where, value: { in: values } },
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
      })
    : [];

  const bySender = new Map<string, typeof items>();
  for (const item of items) {
    const list = bySender.get(item.value) ?? [];
    list.push(item);
    bySender.set(item.value, list);
  }

  const senders = values.map((value) => {
    const senderItems = bySender.get(value) ?? [];
    const toRule = (item: (typeof senderItems)[number]) => ({
      id: item.group?.rule?.id ?? "",
      name: item.group?.rule?.name ?? "",
      enabled: item.group?.rule?.enabled ?? false,
      label: item.group?.rule?.actions[0]?.label ?? null,
    });
    const latest = senderItems[0];

    return {
      sender: value,
      trainedInto: senderItems.filter((i) => !i.exclude).map(toRule),
      excludedFrom: senderItems.filter((i) => i.exclude).map(toRule),
      source: latest?.source ?? null,
      reason: latest?.reason ?? null,
      createdAt: latest?.createdAt ?? null,
    };
  });

  return {
    senders,
    total: allSenders.length,
    totalPages: Math.max(1, Math.ceil(allSenders.length / LIMIT)),
  };
}

export const GET = withEmailAccount("user/trained-senders", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const url = new URL(request.url);
  const page = Math.max(
    1,
    Number.parseInt(url.searchParams.get("page") || "1") || 1,
  );
  const query = url.searchParams.get("q")?.trim() ?? "";

  const result = await getTrainedSenders({ emailAccountId, page, query });
  return NextResponse.json(result);
});
