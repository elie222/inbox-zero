import { getMockMessage } from "@/__tests__/helpers";
import type {
  DemoInboxAddress,
  DemoInboxFixture,
  DemoInboxMessage,
} from "@/__tests__/fixtures/inboxes/types";
import {
  type ActionType,
  LogicalOperator,
  SystemType,
} from "@/generated/prisma/enums";
import { getDefaultActions, getRuleConfig } from "@/utils/rule/consts";

export type GmailSeedMessage = {
  id: string;
  user_email: string;
  from: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  label_ids: string[];
  internal_date: string;
};

export type DemoInboxRuleRow = ReturnType<typeof buildRuleRow>;

export type DemoRuleFixture = {
  name: string;
  instructions: string;
  actions: DemoRuleActionFixture[];
  runOnThreads?: boolean;
  systemType?: SystemType | null;
};

export type DemoRuleActionFixture = {
  type: ActionType;
  label?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  url?: string | null;
  folderName?: string | null;
  delayInMinutes?: number | null;
};

const DEFAULT_SYSTEM_TYPES = [
  SystemType.TO_REPLY,
  SystemType.FYI,
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
];

export function flattenFixtureMessages(fixture: DemoInboxFixture) {
  return fixture.threads.flatMap((thread) =>
    thread.messages.map((message) => ({
      thread,
      message,
    })),
  );
}

export function toGmailSeedMessages(
  fixture: DemoInboxFixture,
): GmailSeedMessage[] {
  return flattenFixtureMessages(fixture).map(({ message }) => ({
    id: message.id,
    user_email: fixture.mailbox.email,
    from: formatAddress(message.from),
    to: message.to.map(formatAddress).join(", "),
    subject: message.subject,
    body_text: message.bodyText,
    body_html: message.bodyHtml,
    label_ids: getMessageLabelIds(fixture, message),
    internal_date: String(new Date(message.date).getTime()),
  }));
}

export function toMockMessages(fixture: DemoInboxFixture) {
  return flattenFixtureMessages(fixture).map(({ thread, message }) =>
    getMockMessage({
      id: message.id,
      threadId: thread.id,
      from: formatAddress(message.from),
      to: message.to.map(formatAddress).join(", "),
      subject: message.subject,
      snippet: getSnippet(message.bodyText),
      textPlain: message.bodyText,
      textHtml: message.bodyHtml ?? `<p>${message.bodyText}</p>`,
      labelIds: getMessageLabelIds(fixture, message),
    }),
  );
}

export function searchFixtureMessages({
  fixture,
  query,
  maxResults = 20,
  pageToken,
}: {
  fixture: DemoInboxFixture;
  query: string;
  maxResults?: number;
  pageToken?: string;
}) {
  const offset = pageToken ? Number.parseInt(pageToken, 10) || 0 : 0;
  const normalizedQuery = query.trim().toLowerCase();
  const matchingMessages = toMockMessages(fixture).filter((message) =>
    messageMatchesQuery({
      fixture,
      subject: message.subject,
      textPlain: message.textPlain,
      from: message.headers.from,
      to: message.headers.to,
      labelIds: message.labelIds,
      normalizedQuery,
    }),
  );
  const page = matchingMessages.slice(offset, offset + maxResults);
  const nextOffset = offset + page.length;

  return {
    messages: page,
    nextPageToken:
      nextOffset < matchingMessages.length ? String(nextOffset) : undefined,
  };
}

export function toFixtureLabelRows(fixture: DemoInboxFixture) {
  return fixture.labels.map((label) => ({
    id: label.id,
    name: label.name,
    type: label.type,
  }));
}

export function toRuleRows({
  rules = [],
  includeSystemRules = true,
  extraRules = [],
}: {
  rules?: DemoRuleFixture[];
  includeSystemRules?: boolean;
  extraRules?: DemoRuleFixture[];
}) {
  const systemRules = includeSystemRules
    ? buildSystemRuleRows(DEFAULT_SYSTEM_TYPES)
    : [];

  return [
    ...systemRules,
    ...rules.map(buildRuleFixtureRow),
    ...extraRules.map(buildRuleFixtureRow),
  ];
}

export function buildRuleFixtureRow(rule: DemoRuleFixture) {
  return buildRuleRow({
    name: rule.name,
    instructions: rule.instructions,
    actions: rule.actions,
    runOnThreads: rule.runOnThreads ?? false,
    systemType: rule.systemType ?? null,
  });
}

export function buildRuleRow({
  name,
  instructions,
  actions,
  runOnThreads = false,
  systemType = null,
  from = null,
  to = null,
  subject = null,
  conditionalOperator = LogicalOperator.AND,
}: {
  name: string;
  instructions: string | null;
  actions: Array<{
    type: ActionType;
    content?: string | null;
    label?: string | null;
    to?: string | null;
    cc?: string | null;
    bcc?: string | null;
    subject?: string | null;
    url?: string | null;
    folderName?: string | null;
    delayInMinutes?: number | null;
  }>;
  runOnThreads?: boolean;
  systemType?: SystemType | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  conditionalOperator?: LogicalOperator;
}) {
  return {
    id: `${name.toLowerCase().replace(/\s+/g, "-")}-rule-id`,
    name,
    instructions,
    updatedAt: new Date("2026-04-20T12:00:00.000Z"),
    from,
    to,
    subject,
    conditionalOperator,
    enabled: true,
    runOnThreads,
    systemType,
    actions: actions.map((action) => ({
      type: action.type,
      content: action.content ?? null,
      label: action.label ?? null,
      to: action.to ?? null,
      cc: action.cc ?? null,
      bcc: action.bcc ?? null,
      subject: action.subject ?? null,
      url: action.url ?? null,
      folderName: action.folderName ?? null,
      delayInMinutes: action.delayInMinutes ?? null,
    })),
  };
}

function buildSystemRuleRows(systemTypes: SystemType[]) {
  return systemTypes.map((systemType) => {
    const config = getRuleConfig(systemType);

    return buildRuleRow({
      name: config.name,
      instructions: config.instructions,
      actions: getDefaultActions(systemType, "google").map((action) => ({
        type: action.type,
        content: action.content,
        label: action.label,
        to: action.to,
        cc: action.cc,
        bcc: action.bcc,
        subject: action.subject,
        url: action.url,
        folderName: action.folderName,
        delayInMinutes: action.delayInMinutes,
      })),
      runOnThreads: config.runOnThreads,
      systemType,
    });
  });
}

function messageMatchesQuery({
  fixture,
  subject,
  textPlain,
  from,
  to,
  labelIds,
  normalizedQuery,
}: {
  fixture: DemoInboxFixture;
  subject: string;
  textPlain: string;
  from: string;
  to: string;
  labelIds: string[];
  normalizedQuery: string;
}) {
  if (!normalizedQuery) return true;

  if (hasTerm(normalizedQuery, "is:unread") && !labelIds.includes("UNREAD")) {
    return false;
  }
  if (hasTerm(normalizedQuery, "in:inbox") && !labelIds.includes("INBOX")) {
    return false;
  }

  const fromFilter = getOperatorValue(normalizedQuery, "from");
  if (fromFilter && !from.toLowerCase().includes(fromFilter)) return false;

  const toFilter = getOperatorValue(normalizedQuery, "to");
  if (toFilter && !to.toLowerCase().includes(toFilter)) return false;

  const subjectFilter = getOperatorValue(normalizedQuery, "subject");
  if (subjectFilter && !subject.toLowerCase().includes(subjectFilter)) {
    return false;
  }

  const labelFilter = getOperatorValue(normalizedQuery, "label");
  if (labelFilter && !messageHasLabel(fixture, labelIds, labelFilter)) {
    return false;
  }

  const searchableText = [from, to, subject, textPlain].join(" ").toLowerCase();
  const freeTextTerms = getFreeTextTerms(normalizedQuery);
  if (/\bor\b/.test(normalizedQuery)) {
    return (
      freeTextTerms.length === 0 ||
      freeTextTerms.some((term) => searchableText.includes(term))
    );
  }

  return freeTextTerms.every((term) => searchableText.includes(term));
}

function getMessageLabelIds(
  fixture: DemoInboxFixture,
  message: DemoInboxMessage,
) {
  const labelLookup = new Map(
    fixture.labels.flatMap((label) => [
      [label.id.toLowerCase(), label.id],
      [label.name.toLowerCase(), label.id],
    ]),
  );
  const ids = new Set(
    (message.labels ?? ["INBOX"]).map(
      (label) => labelLookup.get(label.toLowerCase()) ?? label,
    ),
  );

  if (message.unread) ids.add("UNREAD");

  return [...ids];
}

function messageHasLabel(
  fixture: DemoInboxFixture,
  labelIds: string[],
  labelFilter: string,
) {
  const expectedLabel = labelFilter.replace(/^["']|["']$/g, "").toLowerCase();

  return labelIds.some((labelId) => {
    const label = fixture.labels.find((candidate) => candidate.id === labelId);
    return (
      labelId.toLowerCase().includes(expectedLabel) ||
      label?.name.toLowerCase().includes(expectedLabel)
    );
  });
}

function formatAddress(address: DemoInboxAddress) {
  return address.name ? `${address.name} <${address.email}>` : address.email;
}

function getSnippet(text: string) {
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function hasTerm(query: string, term: string) {
  return query.split(/\s+/).includes(term);
}

function getOperatorValue(query: string, operator: string) {
  const match = query.match(new RegExp(`${operator}:("[^"]+"|'[^']+'|\\S+)`));
  return match?.[1]?.replace(/^["']|["']$/g, "").toLowerCase() ?? null;
}

function getFreeTextTerms(query: string) {
  return query
    .replace(/(^|\s)-("[^"]+"|'[^']+'|\S+)/g, " ")
    .replace(/\b(from|to|subject|label):("[^"]+"|'[^']+'|\S+)/g, " ")
    .replace(/\b(is|in|after|before|newer_than|older_than):\S+/g, " ")
    .replace(/[()"']/g, " ")
    .split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter(
      (term) =>
        term.length > 2 &&
        !["and", "or", "not", "the", "with", "for"].includes(term),
    );
}
