import type { ActionsBlock, Button, KnownBlock, Block } from "@slack/types";
import type { ThreadTrackerType } from "@/generated/prisma/enums";
import { escapeSlackText } from "@/utils/messaging/providers/slack/format";
import { getFollowUpCopy, truncateSnippet } from "@/utils/follow-up/copy";
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
  trackerId,
}: FollowUpReminderBlocksParams): (KnownBlock | Block)[] {
  const { directionLine, preposition, verb } = getFollowUpCopy(trackerType);
  const sentenceVerb = `${verb} ${daysSinceSent} ${pluralize(daysSinceSent, "day")} ago`;

  const counterpartyMarkdown = `${preposition} *${escapeSlackText(counterpartyName)}* \`<${escapeSlackText(counterpartyEmail)}>\``;

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Follow-up nudge", emoji: true },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${directionLine}_` }],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackText(subject)}*\n${counterpartyMarkdown} · ${sentenceVerb}`,
      },
    },
  ];

  if (snippet) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${escapeSlackText(truncateSnippet(snippet))}`,
      },
    });
  }

  const actionElements: Button[] = [];
  if (threadLink) {
    actionElements.push({
      type: "button",
      text: { type: "plain_text", text: "Open thread", emoji: true },
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
