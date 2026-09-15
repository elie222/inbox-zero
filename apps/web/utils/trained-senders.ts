import {
  ActionType,
  GroupItemType,
  NewsletterStatus,
} from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

const PAGE_SIZE = 50;

export function parsePage(url: URL) {
  return Math.max(1, Number.parseInt(url.searchParams.get("page") || "1") || 1);
}

const trainedItemSelect = {
  id: true,
  value: true,
  exclude: true,
  source: true,
  reason: true,
  createdAt: true,
  group: {
    select: {
      emailAccountId: true,
      rule: {
        select: {
          id: true,
          name: true,
          actions: { select: { type: true, label: true } },
        },
      },
    },
  },
} satisfies Prisma.GroupItemSelect;

type TrainedItem = Prisma.GroupItemGetPayload<{
  select: typeof trainedItemSelect;
}>;

function trainedItemsWhere({
  emailAccountIds,
  query,
}: {
  emailAccountIds: string[];
  query: string;
}): Prisma.GroupItemWhereInput {
  return {
    type: GroupItemType.FROM,
    group: { emailAccountId: { in: emailAccountIds }, rule: { isNot: null } },
    ...(query ? { value: { contains: query, mode: "insensitive" } } : {}),
  };
}

function toRule(item: TrainedItem) {
  const rule = item.group?.rule;
  const actions = rule?.actions ?? [];
  return {
    id: rule?.id ?? "",
    name: rule?.name ?? "",
    label: actions.find((a) => a.type === ActionType.LABEL)?.label ?? null,
    deletes: actions.some((a) => a.type === ActionType.DELETE),
  };
}

/** One row per (mailbox, sender), newest item first within a row. */
function groupTrainedItems(items: TrainedItem[]) {
  const bySender = new Map<string, TrainedItem[]>();
  for (const item of items) {
    const key = `${item.group?.emailAccountId} ${item.value}`;
    const list = bySender.get(key) ?? [];
    list.push(item);
    bySender.set(key, list);
  }

  return [...bySender.values()].map((senderItems) => {
    const latest = senderItems[0];
    return {
      emailAccountId: latest?.group?.emailAccountId ?? "",
      sender: latest?.value ?? "",
      trainedInto: senderItems.filter((i) => !i.exclude).map(toRule),
      excludedFrom: senderItems.filter((i) => i.exclude).map(toRule),
      unsubscribed: false,
      source: latest?.source ?? null,
      reason: latest?.reason ?? null,
      createdAt: latest?.createdAt ?? null,
    };
  });
}

/**
 * Senders across several mailboxes, newest training first, paginated.
 * ponytail: groups in memory - fine for thousands of patterns; move the
 * grouping into SQL if an account ever has tens of thousands.
 */
export async function getTrainedSendersAcrossAccounts({
  emailAccountIds,
  page,
  query,
  label = "",
}: {
  emailAccountIds: string[];
  page: number;
  query: string;
  label?: string;
}) {
  const items = emailAccountIds.length
    ? await prisma.groupItem.findMany({
        where: trainedItemsWhere({ emailAccountIds, query }),
        select: trainedItemSelect,
        orderBy: { createdAt: "desc" },
      })
    : [];

  const trained = groupTrainedItems(items);

  // Unsubscribed senders (label-triggered or bulk) are listed too, so the
  // block can be lifted from here. Their mail is tagged and left in the inbox.
  const unsubscribedSenders = emailAccountIds.length
    ? await prisma.newsletter.findMany({
        where: {
          emailAccountId: { in: emailAccountIds },
          status: NewsletterStatus.UNSUBSCRIBED,
          ...(query ? { email: { contains: query, mode: "insensitive" } } : {}),
        },
        select: { emailAccountId: true, email: true, updatedAt: true },
      })
    : [];

  const seen = new Set(trained.map((r) => `${r.emailAccountId} ${r.sender}`));
  for (const row of trained) {
    row.unsubscribed = unsubscribedSenders.some(
      (n) => n.emailAccountId === row.emailAccountId && n.email === row.sender,
    );
  }
  const extra = unsubscribedSenders
    .filter((n) => !seen.has(`${n.emailAccountId} ${n.email}`))
    .map((n) => ({
      emailAccountId: n.emailAccountId,
      sender: n.email,
      trainedInto: [],
      excludedFrom: [],
      unsubscribed: true,
      source: null,
      reason: "Unsubscribed",
      createdAt: n.updatedAt,
    }));

  const all = [...trained, ...extra].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  );
  // Labels the listed rules apply, for the filter dropdown.
  const labels = [
    ...new Set(
      all.flatMap((r) => r.trainedInto.map((x) => x.label)).filter(Boolean),
    ),
  ].sort() as string[];
  const rows = label
    ? all.filter((r) => r.trainedInto.some((x) => x.label === label))
    : all;
  const start = (page - 1) * PAGE_SIZE;

  return {
    senders: rows.slice(start, start + PAGE_SIZE),
    labels,
    total: rows.length,
    unsubscribed: unsubscribedSenders.length,
    totalPages: Math.max(1, Math.ceil(rows.length / PAGE_SIZE)),
  };
}
