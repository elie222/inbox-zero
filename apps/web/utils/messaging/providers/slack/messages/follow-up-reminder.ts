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
  const { directionLine, counterpartyPrefix, snippetLabel, emoji } =
    getFollowUpCopy(trackerType);
  const elapsedTime = `${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`;

  const counterpartyMarkdown = `${escapeSlackText(counterpartyPrefix)} *${escapeSlackText(normalizeFollowUpText(counterpartyName))}* \`<${escapeSlackText(counterpartyEmail)}>\``;

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${emoji} Follow-up nudge`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${directionLine}_` }],
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
        text: `*${escapeSlackText(snippetLabel)}:*\n> ${escapeSlackText(truncateSnippet(snippet))}`,
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

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Inbox Zero" }],
  });

  return blocks;
}
