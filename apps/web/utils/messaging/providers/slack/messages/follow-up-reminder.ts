import type { KnownBlock, Block } from "@slack/types";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { escapeSlackText } from "@/utils/messaging/providers/slack/format";

export type FollowUpReminderBlocksParams = {
  subject: string;
  counterparty: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  threadLink?: string;
};

export function buildFollowUpReminderBlocks({
  subject,
  counterparty,
  trackerType,
  daysSinceSent,
  threadLink,
}: FollowUpReminderBlocksParams): (KnownBlock | Block)[] {
  const isAwaiting = trackerType === ThreadTrackerType.AWAITING;
  const headerText = isAwaiting ? "Follow-up nudge" : "Reply needed";

  const dayLabel = daysSinceSent === 1 ? "day" : "days";
  const sentenceVerb = isAwaiting
    ? `sent ${daysSinceSent} ${dayLabel} ago`
    : `received ${daysSinceSent} ${dayLabel} ago`;
  // AWAITING: the user emailed `counterparty` — they are the recipient.
  // NEEDS_REPLY: `counterparty` emailed the user — they are the sender.
  const preposition = isAwaiting ? "to" : "from";

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackText(subject)}*\n${preposition} _${escapeSlackText(counterparty)}_ · ${sentenceVerb}`,
      },
    },
  ];

  if (threadLink) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open thread", emoji: true },
          url: threadLink,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "Inbox Zero" }],
  });

  return blocks;
}
