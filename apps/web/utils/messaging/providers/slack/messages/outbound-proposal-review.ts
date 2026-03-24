import type { KnownBlock, Block } from "@slack/types";
import { markdownToSlackMrkdwn } from "@/utils/messaging/providers/slack/format";
import { truncate } from "@/utils/string";

export function buildOutboundProposalReviewBlocks({
  accountName,
  mentionUserId,
  originalFrom,
  originalSubject,
  proposalContent,
  sendValue,
  dismissValue,
  openInInboxUrl,
}: {
  accountName?: string | null;
  mentionUserId?: string | null;
  originalFrom?: string | null;
  originalSubject?: string | null;
  proposalContent?: string | null;
  sendValue: string;
  dismissValue: string;
  openInInboxUrl?: string | null;
}): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Review draft reply",
        emoji: true,
      },
    },
  ];

  const summaryLines = [
    mentionUserId ? `<@${mentionUserId}>` : null,
    originalFrom ? `*From:* ${escapeSlackText(originalFrom)}` : null,
    originalSubject ? `*Subject:* ${escapeSlackText(originalSubject)}` : null,
    accountName ? `*Account:* ${escapeSlackText(accountName)}` : null,
  ].filter(Boolean);

  if (summaryLines.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: summaryLines.join("\n"),
      },
    });
  }

  const preview = buildProposalPreview(proposalContent);
  if (preview) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Draft preview*\n${preview}`,
      },
    });
  }

  const elements = [
    {
      type: "button",
      text: {
        type: "plain_text",
        text: "Send",
        emoji: true,
      },
      style: "primary",
      action_id: "draft-review-send",
      value: sendValue,
    },
    {
      type: "button",
      text: {
        type: "plain_text",
        text: "Dismiss",
        emoji: true,
      },
      action_id: "draft-review-dismiss",
      value: dismissValue,
    },
  ];

  if (openInInboxUrl) {
    elements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open in Inbox",
        emoji: true,
      },
      url: openInInboxUrl,
      action_id: "draft-review-open",
      value: "open",
    });
  }

  blocks.push({
    type: "actions",
    elements,
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "_Reply in this thread with edits. The latest card is the active version._",
      },
    ],
  });

  return blocks;
}

function buildProposalPreview(content?: string | null) {
  const trimmed = content?.trim();
  if (!trimmed) return null;

  return markdownToSlackMrkdwn(truncate(trimmed, 900));
}

function escapeSlackText(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
