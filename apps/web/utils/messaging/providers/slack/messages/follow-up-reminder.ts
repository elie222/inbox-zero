import type { ActionsBlock, Button, KnownBlock, Block } from "@slack/types";
import type { ThreadTrackerType } from "@/generated/prisma/enums";
import { escapeSlackText } from "@/utils/messaging/providers/slack/format";
import {
  getFollowUpCopy,
  normalizeFollowUpText,
  truncateSnippet,
} from "@/utils/follow-up/copy";
import { FOLLOW_UP_MARK_DONE_ACTION_ID } from "@/utils/follow-up/follow-up-actions";
import { pluralize } from "@/utils/string";

const SLACK_SNIPPET_MAX_CHARS = 2200;
const SLACK_SECTION_TEXT_MAX_CHARS = 3000;

export type FollowUpReminderBlocksParams = {
  subject: string;
  counterpartyName: string;
  counterpartyEmail: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  snippet?: string;
  threadLink?: string;
  threadLinkLabel?: string;
  trackerId: string;
};

export function buildFollowUpReminderBlocks({
  subject,
  counterpartyName,
  counterpartyEmail,
  trackerType,
  daysSinceSent,
  snippet,
  threadLink,
  threadLinkLabel,
  trackerId,
}: FollowUpReminderBlocksParams): (KnownBlock | Block)[] {
  const { isAwaiting, counterpartyPrefix, snippetLabel, emoji } =
    getFollowUpCopy(trackerType);
  const elapsedTime = `${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`;
  const title = isAwaiting
    ? "Follow-up: waiting for their reply"
    : "Follow-up: reply needed from you";

  const counterpartyMarkdown = `${escapeSlackText(counterpartyPrefix)} *${escapeSlackText(normalizeFollowUpText(counterpartyName))}* \`<${escapeSlackText(counterpartyEmail)}>\``;

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} ${title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackText(normalizeFollowUpText(subject))}*\n${counterpartyMarkdown} · ${elapsedTime}`,
      },
    },
  ];

  if (snippet) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: formatSlackSnippetSectionText(snippetLabel, snippet),
      },
    });
  }

  const actionElements: Button[] = [];
  if (threadLink) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: threadLinkLabel ?? "Open email",
        emoji: true,
      },
      url: threadLink,
    });
  }
  actionElements.push({
    type: "button",
    action_id: FOLLOW_UP_MARK_DONE_ACTION_ID,
    text: { type: "plain_text", text: "Mark done", emoji: true },
    value: trackerId,
  });
  const actionsBlock: ActionsBlock = {
    type: "actions",
    elements: actionElements,
  };
  blocks.push(actionsBlock);

  return blocks;
}

function formatSlackSnippetSectionText(label: string, snippet: string): string {
  const prefix = `*${escapeSlackText(label)}:*`;
  const format = (maxChars: number) =>
    `${prefix}\n${formatSlackQuotedText(truncateSnippet(snippet, maxChars))}`;

  const fullText = format(SLACK_SNIPPET_MAX_CHARS);
  if (fullText.length <= SLACK_SECTION_TEXT_MAX_CHARS) return fullText;

  let best = format(1);
  let low = 1;
  let high = SLACK_SNIPPET_MAX_CHARS;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = format(mid);
    if (candidate.length <= SLACK_SECTION_TEXT_MAX_CHARS) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function formatSlackQuotedText(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const escaped = escapeSlackText(line);
      return escaped ? `> ${escaped}` : ">";
    })
    .join("\n");
}
