import type { KnownBlock, Block } from "@slack/types";

const MAX_BODY_LENGTH = 1500;

export type DraftNotificationBlocksParams = {
  recipient: string;
  subject: string;
  draftBody: string;
};

export function buildDraftNotificationBlocks({
  recipient,
  subject,
  draftBody,
}: DraftNotificationBlocksParams): (KnownBlock | Block)[] {
  const truncatedBody =
    draftBody.length > MAX_BODY_LENGTH
      ? `${draftBody.slice(0, MAX_BODY_LENGTH)}...`
      : draftBody;

  const quotedBody = truncatedBody
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Draft reply ready", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${recipient}\n*Subject:* ${subject}`,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: quotedBody },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Send", emoji: true },
          style: "primary",
          action_id: "draft_send",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Edit", emoji: true },
          action_id: "draft_edit",
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss", emoji: true },
          style: "danger",
          action_id: "draft_dismiss",
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Inbox Zero draft notification_",
        },
      ],
    },
  ];
}

export function buildDraftSentBlocks({
  recipient,
  subject,
  edited,
}: {
  recipient: string;
  subject: string;
  edited?: boolean;
}): (KnownBlock | Block)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${recipient}\n*Subject:* ${subject}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: edited
            ? "_Draft sent (edited) via Inbox Zero_"
            : "_Draft sent via Inbox Zero_",
        },
      ],
    },
  ];
}

export function buildDraftDismissedBlocks({
  recipient,
  subject,
}: {
  recipient: string;
  subject: string;
}): (KnownBlock | Block)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `~*To:* ${recipient}\n*Subject:* ${subject}~`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "_Draft dismissed — draft deleted from inbox_",
        },
      ],
    },
  ];
}
