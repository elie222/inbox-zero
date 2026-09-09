import { MailSplitFilterKind } from "@/generated/prisma/enums";
import type { MailSplitFilterDraft } from "@/utils/mail/split-filters";

/**
 * A condition in the prepared library, written against label *names* so one
 * catalogue works for every account — ids are resolved per account at render.
 */
type LibraryCondition =
  | { kind: "LABEL"; labelName: string }
  | { kind: "CATEGORY"; categoryName: string }
  | { kind: "FROM"; sender: string }
  | { kind: "UNREAD" }
  | { kind: "STARRED" };

export type SplitLibraryEntry = {
  name: string;
  description: string;
  category: string;
  conditions: LibraryCondition[];
  /** Prepared splits ask for every condition unless they list alternatives. */
  matchAll?: boolean;
};

export const SPLIT_LIBRARY: SplitLibraryEntry[] = [
  {
    name: "To reply",
    category: "General",
    description:
      "Conversations waiting on your answer, labelled by Reply Zero.",
    conditions: [{ kind: "LABEL", labelName: "To reply" }],
  },
  {
    name: "Starred",
    category: "General",
    description: "Everything you have starred, in one place.",
    conditions: [{ kind: "STARRED" }],
  },
  {
    name: "Awaiting reply",
    category: "General",
    description: "You answered — they have not. Nudge-worthy threads.",
    conditions: [{ kind: "LABEL", labelName: "Awaiting Reply" }],
  },
  {
    name: "Calendar",
    category: "General",
    description: "Invitations, reschedules and meeting notifications.",
    conditions: [{ kind: "LABEL", labelName: "Calendar" }],
  },
  {
    name: "Receipts",
    category: "General",
    description: "Payments, payouts and invoices.",
    conditions: [{ kind: "LABEL", labelName: "Receipt" }],
  },
  {
    name: "Newsletters",
    category: "General",
    description: "Bulk mail you subscribed to — read when you have time.",
    conditions: [{ kind: "LABEL", labelName: "Newsletter" }],
  },
  {
    name: "Notifications",
    category: "General",
    description: "Tool alerts and digests, out of the main inbox.",
    conditions: [{ kind: "LABEL", labelName: "Notification" }],
  },
  {
    name: "Cold email",
    category: "General",
    description: "Unsolicited outreach from senders you have no history with.",
    conditions: [{ kind: "LABEL", labelName: "Cold email" }],
  },
  {
    name: "Unread",
    category: "General",
    description: "Everything you have not opened yet.",
    conditions: [{ kind: "UNREAD" }],
  },
  {
    name: "GitHub",
    category: "Apps",
    description: "Pull requests, reviews and issue activity.",
    conditions: [
      { kind: "FROM", sender: "mentions@noreply.github.com" },
      { kind: "FROM", sender: "notifications@github.com" },
    ],
    matchAll: false,
  },
  {
    name: "Stripe",
    category: "Apps",
    description: "Payouts, disputes and invoice receipts from Stripe.",
    conditions: [{ kind: "FROM", sender: "receipts@stripe.com" }],
  },
  {
    name: "Linear",
    category: "Apps",
    description: "Issue assignments, comments and mentions from Linear.",
    conditions: [
      { kind: "FROM", sender: "notifications@linear.app" },
      { kind: "FROM", sender: "notifications@mail.linear.app" },
    ],
    matchAll: false,
  },
  {
    name: "Figma",
    category: "Apps",
    description: "Comments and file updates from your team.",
    conditions: [{ kind: "FROM", sender: "no-reply@figma.com" }],
  },
  {
    name: "Notion",
    category: "Apps",
    description: "Comments, mentions, and updates to your documents.",
    conditions: [{ kind: "FROM", sender: "notify@mail.notion.so" }],
  },
  {
    name: "Asana",
    category: "Apps",
    description: "Task assignments, deadlines, and project updates.",
    conditions: [{ kind: "FROM", sender: "no-reply@asana.com" }],
  },
  {
    name: "Trello",
    category: "Apps",
    description: "Board invitations and task notifications.",
    conditions: [{ kind: "FROM", sender: "do-not-reply@trello.com" }],
  },
  {
    name: "HubSpot",
    category: "Apps",
    description: "Lead activity, form submissions, and CRM notifications.",
    conditions: [
      { kind: "FROM", sender: "noreply@notifications.hubspot.com" },
      { kind: "FROM", sender: "no-reply@hubspot.com" },
      { kind: "FROM", sender: "noreply@hubspot.com" },
    ],
    matchAll: false,
  },
  {
    name: "Salesforce",
    category: "Apps",
    description: "Opportunity updates and sales activity.",
    conditions: [
      { kind: "FROM", sender: "info@salesforce.com" },
      { kind: "FROM", sender: "support@salesforce.com" },
      { kind: "FROM", sender: "email@mail.salesforce.com" },
      { kind: "FROM", sender: "noreply@salesforce.com" },
      { kind: "FROM", sender: "no-reply@salesforce.com" },
      { kind: "FROM", sender: "notifications@salesforce.com" },
    ],
    matchAll: false,
  },
  {
    name: "Pipedrive",
    category: "Apps",
    description: "Deal updates, follow-ups, and pipeline activity.",
    conditions: [
      { kind: "FROM", sender: "notifications@pipedrive.com" },
      { kind: "FROM", sender: "info@pipedrive.com" },
      { kind: "FROM", sender: "notifier@pipedrive.com" },
      { kind: "FROM", sender: "support@pipedrive.com" },
      { kind: "FROM", sender: "noreply@pipedrive.com" },
    ],
    matchAll: false,
  },
];

export const SPLIT_LIBRARY_CATEGORIES = [
  ...new Set(SPLIT_LIBRARY.map((entry) => entry.category)),
];

/**
 * Resolves an entry's label and category names against this account. Returns
 * null when the account has no such label, so the library never offers a split
 * that would come back empty for a reason the reader can't see.
 */
export function resolveLibraryEntry(
  entry: SplitLibraryEntry,
  {
    labelsByName,
    categoriesByName,
  }: {
    labelsByName: Map<string, string>;
    categoriesByName: Map<string, string>;
  },
): MailSplitFilterDraft[] | null {
  const filters: MailSplitFilterDraft[] = [];

  for (const condition of entry.conditions) {
    switch (condition.kind) {
      case "UNREAD":
        filters.push({ kind: MailSplitFilterKind.UNREAD, value: null });
        break;
      case "STARRED":
        filters.push({ kind: MailSplitFilterKind.STARRED, value: null });
        break;
      case "FROM":
        filters.push({
          kind: MailSplitFilterKind.FROM,
          value: condition.sender,
        });
        break;
      case "LABEL": {
        const labelId = labelsByName.get(condition.labelName.toLowerCase());
        if (!labelId) return null;
        filters.push({ kind: MailSplitFilterKind.LABEL, value: labelId });
        break;
      }
      case "CATEGORY": {
        const category = categoriesByName.get(
          condition.categoryName.toLowerCase(),
        );
        if (!category) return null;
        filters.push({ kind: MailSplitFilterKind.CATEGORY, value: category });
        break;
      }
    }
  }

  return filters;
}

/** The human-readable "Definition" rows shown on a library entry's detail view. */
export function libraryDefinition(entry: SplitLibraryEntry) {
  return entry.conditions.map((condition) => {
    switch (condition.kind) {
      case "UNREAD":
        return { key: "Is", value: "unread" };
      case "STARRED":
        return { key: "Is", value: "starred" };
      case "FROM":
        return { key: "From", value: condition.sender };
      case "LABEL":
        return { key: "Label", value: condition.labelName };
      case "CATEGORY":
        return { key: "Category", value: condition.categoryName };
    }
  });
}
