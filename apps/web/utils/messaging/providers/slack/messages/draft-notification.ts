import type { KnownBlock, Block } from "@slack/types";

const MAX_BODY_LENGTH = 1500;
const SLACK_BLOCK_TEXT_LIMIT = 3000;

type DraftNotificationBlocksParams = {
  recipient: string;
  subject: string;
  draftBody: string;
};

export function buildDraftNotificationBlocks({
  recipient,
  subject,
  draftBody,
}: DraftNotificationBlocksParams): (KnownBlock | Block)[] {
  const safeRecipient = escapeSlackMrkdwn(recipient);
  const safeSubject = escapeSlackMrkdwn(subject);

  const truncatedBody =
    draftBody.length > MAX_BODY_LENGTH
      ? `${draftBody.slice(0, MAX_BODY_LENGTH)}...`
      : draftBody;

  let quotedBody = escapeSlackMrkdwn(truncatedBody)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  if (quotedBody.length > SLACK_BLOCK_TEXT_LIMIT) {
    quotedBody = `${quotedBody.slice(0, SLACK_BLOCK_TEXT_LIMIT - 3)}...`;
  }

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Draft reply ready", emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${safeRecipient}\n*Subject:* ${safeSubject}`,
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
  const safeRecipient = escapeSlackMrkdwn(recipient);
  const safeSubject = escapeSlackMrkdwn(subject);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*To:* ${safeRecipient}\n*Subject:* ${safeSubject}`,
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
  const safeRecipient = escapeSlackMrkdwn(recipient);
  const safeSubject = escapeSlackMrkdwn(subject);

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `~*To:* ${safeRecipient}\n*Subject:* ${safeSubject}~`,
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

function escapeSlackMrkdwn(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
