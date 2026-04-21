import type { KnownBlock, Block } from "@slack/types";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { escapeSlackText } from "@/utils/messaging/providers/slack/format";

export type FollowUpReminderBlocksParams = {
  subject: string;
  sender: string;
  trackerType: ThreadTrackerType;
  daysSinceSent: number;
  threadLink?: string;
};

export function buildFollowUpReminderBlocks({
  subject,
  sender,
  trackerType,
  daysSinceSent,
  threadLink,
}: FollowUpReminderBlocksParams): (KnownBlock | Block)[] {
  const headerText =
    trackerType === ThreadTrackerType.AWAITING
      ? "Follow-up nudge"
      : "Reply needed";

  const dayLabel = daysSinceSent === 1 ? "day" : "days";
  const sentenceVerb =
    trackerType === ThreadTrackerType.AWAITING
      ? `sent ${daysSinceSent} ${dayLabel} ago`
      : `received ${daysSinceSent} ${dayLabel} ago`;

  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${escapeSlackText(subject)}*\nfrom _${escapeSlackText(sender)}_ · ${sentenceVerb}`,
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
