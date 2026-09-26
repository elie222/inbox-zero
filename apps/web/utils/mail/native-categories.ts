import { SafeError } from "@/utils/error";
import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import { isOutlookInboxSection } from "@/utils/mail/outlook-inbox";
import {
  mailSplitToThreadsQuery,
  type MailSplit,
} from "@/utils/mail/split-query";
import { flattenOutlookFolders } from "@/utils/outlook/folders";
import prisma from "@/utils/prisma";
import {
  getRuleLabel,
  STANDARD_CATEGORY_SYSTEM_TYPES,
} from "@/utils/rule/consts";
import type { ThreadsQuery } from "@/utils/threads/validation";

const GMAIL_CATEGORIES = [
  { name: "Personal", type: GmailLabel.PERSONAL },
  { name: "Social", type: GmailLabel.SOCIAL },
  { name: "Updates", type: GmailLabel.UPDATES },
  { name: "Forums", type: GmailLabel.FORUMS },
  { name: "Promotions", type: GmailLabel.PROMOTIONS },
] as const;

const MAILBOX_TYPES = new Set([
  "inbox",
  "sent",
  "draft",
  "trash",
  "spam",
  "starred",
  "unread",
  "archive",
  "all",
  "snoozed",
  "label",
  "folder",
  "scheduled",
]);

const GMAIL_CATEGORY_BY_ALIAS: Record<string, string> = {
  personal: GmailLabel.PERSONAL,
  social: GmailLabel.SOCIAL,
  updates: GmailLabel.UPDATES,
  forums: GmailLabel.FORUMS,
  promotions: GmailLabel.PROMOTIONS,
};

const LABEL_NAME_BY_ALIAS: Record<string, string> = {};
for (const systemType of STANDARD_CATEGORY_SYSTEM_TYPES) {
  const label = getRuleLabel(systemType);
  const key = normalizeCategoryKey(label);
  LABEL_NAME_BY_ALIAS[key] = label;
  LABEL_NAME_BY_ALIAS[`${key}s`] = label;
}

export type NativeMailCategory = {
  name: string;
  type: string;
  inboxSection: "focused" | "other" | null;
  labelId: string | null;
  folderId: string | null;
};

export function gmailCategoryIdFor(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("CATEGORY_")) return trimmed;
  return GMAIL_CATEGORY_BY_ALIAS[normalizeCategoryKey(trimmed)] ?? null;
}

export function labelNameForCategory(value: string) {
  return LABEL_NAME_BY_ALIAS[normalizeCategoryKey(value)] ?? null;
}

export function isNativeCategoryAlias(value: string) {
  return Boolean(gmailCategoryIdFor(value) || labelNameForCategory(value));
}

export async function listNativeMailSplits({
  emailAccountId,
  emailProvider,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  const [storedSplits, labels] = await Promise.all([
    prisma.mailSplit.findMany({
      where: { emailAccountId },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        order: true,
        matchAll: true,
        filters: {
          orderBy: { order: "asc" },
          select: { kind: true, value: true },
        },
      },
    }),
    emailProvider.getLabels(),
  ]);
  const folders =
    emailProvider.name === "microsoft"
      ? flattenOutlookFolders(await emailProvider.getFolders())
      : [];

  const categories: NativeMailCategory[] = [];
  if (emailProvider.name === "google") {
    for (const category of GMAIL_CATEGORIES) {
      categories.push({
        name: category.name,
        type: category.type,
        inboxSection: null,
        labelId: null,
        folderId: null,
      });
    }
  } else if (emailProvider.name === "microsoft") {
    categories.push(
      {
        name: "Focused",
        type: "inbox",
        inboxSection: "focused",
        labelId: null,
        folderId: null,
      },
      {
        name: "Other",
        type: "inbox",
        inboxSection: "other",
        labelId: null,
        folderId: null,
      },
    );
  }

  for (const systemType of STANDARD_CATEGORY_SYSTEM_TYPES) {
    const labelName = getRuleLabel(systemType);
    const label = labels.find(
      (item) =>
        normalizeCategoryKey(item.name) === normalizeCategoryKey(labelName),
    );
    const folder = folders.find(
      (item) =>
        normalizeCategoryKey(item.displayName) ===
        normalizeCategoryKey(labelName),
    );
    categories.push({
      name: labelName,
      type: label?.id ?? folder?.id ?? labelName,
      inboxSection: null,
      labelId: label?.id ?? null,
      folderId: folder?.id ?? null,
    });
  }

  return {
    categories,
    splits: storedSplits.map((split) => ({
      id: split.id,
      name: split.name,
      order: split.order,
      matchAll: split.matchAll,
      filters: split.filters,
    })),
  };
}

export async function resolveNativeThreadsQuery({
  emailAccountId,
  emailProvider,
  query,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  query: ThreadsQuery;
}): Promise<ThreadsQuery> {
  const category =
    query.category ??
    (query.type &&
    !MAILBOX_TYPES.has(query.type) &&
    !query.type.startsWith("CATEGORY_") &&
    isNativeCategoryAlias(query.type)
      ? query.type
      : null);
  const splitId = query.splitId;
  if (!category && !splitId) {
    const { category: _category, splitId: _splitId, ...rest } = query;
    return rest;
  }

  const { limit, nextPageToken, q } = query;
  const page = { limit, nextPageToken, q };

  if (splitId) {
    const split = await findSplit(emailAccountId, { id: splitId });
    if (!split) throw new SafeError("Unknown split", 404);
    return { ...mailSplitToThreadsQuery(toQuerySplit(split)), ...page };
  }

  if (!category) {
    const { category: _category, splitId: _splitId, ...rest } = query;
    return rest;
  }

  if (isOutlookInboxSection(category)) {
    return { ...page, type: "inbox", inboxSection: category };
  }

  const gmailCategory = gmailCategoryIdFor(category);
  if (gmailCategory) return { ...page, type: gmailCategory };

  const namedSplit = await findSplit(emailAccountId, { name: category });
  if (namedSplit) {
    return { ...mailSplitToThreadsQuery(toQuerySplit(namedSplit)), ...page };
  }

  const labelName = labelNameForCategory(category) ?? category;
  if (emailProvider.name === "microsoft") {
    const folder = flattenOutlookFolders(await emailProvider.getFolders()).find(
      (item) =>
        item.id === category ||
        normalizeCategoryKey(item.displayName) ===
          normalizeCategoryKey(labelName),
    );
    if (folder) return { ...page, folderId: folder.id, type: "folder" };
  }

  const labels = await emailProvider.getLabels();
  const label = labels.find(
    (item) =>
      item.id === category ||
      normalizeCategoryKey(item.name) === normalizeCategoryKey(labelName) ||
      normalizeCategoryKey(item.name) === normalizeCategoryKey(category),
  );
  if (label) return { ...page, labelIds: ["INBOX", label.id] };

  throw new SafeError("Unknown inbox category", 400);
}

async function findSplit(
  emailAccountId: string,
  target: { id: string } | { name: string },
) {
  return prisma.mailSplit.findFirst({
    where: {
      emailAccountId,
      ...("id" in target
        ? { id: target.id }
        : { name: { equals: target.name, mode: "insensitive" } }),
    },
    select: {
      id: true,
      name: true,
      matchAll: true,
      filters: {
        orderBy: { order: "asc" },
        select: { kind: true, value: true },
      },
    },
  });
}

function toQuerySplit(
  split: Awaited<ReturnType<typeof findSplit>> & object,
): MailSplit {
  return {
    id: split.id,
    name: split.name,
    matchAll: split.matchAll,
    filters: split.filters.map((filter) => ({
      kind: filter.kind,
      value: filter.value,
    })),
  };
}

function normalizeCategoryKey(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
