import type { KnownBlock } from "@slack/types";
import { type CosEngineResponse, CATEGORY_ICONS, type Venture } from "../types";

export function buildApprovalMessage({
  response,
  fromEmail,
  subject,
  venture,
}: {
  response: CosEngineResponse;
  fromEmail: string;
  subject: string;
  venture: Venture;
}): KnownBlock[] {
  const icon = CATEGORY_ICONS[response.category];
  const categoryLabel = `${icon} ${response.category}`;
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Chief of Staff — Approval Required",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*From:*\n${fromEmail}`,
        },
        {
          type: "mrkdwn",
          text: `*Subject:*\n${subject}`,
        },
        {
          type: "mrkdwn",
          text: `*Category:*\n${categoryLabel}`,
        },
        {
          type: "mrkdwn",
          text: `*Venture:*\n${venture}`,
        },
      ],
    },
  ];

  // VIP indicator
  if (response.isVip) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `⭐ *VIP Client*${response.vipGroupName ? ` — ${response.vipGroupName}` : ""}`,
      },
    });
  }

  // Summary
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*Summary:*\n${response.summary}`,
    },
  });

  // Conflicts
  if (response.conflicts.length > 0) {
    const conflictLines = response.conflicts
      .map((c) => `• *${c.title}* (${c.calendar}) — ${c.start} → ${c.end}`)
      .join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Calendar Conflicts:*\n${conflictLines}`,
      },
    });
  }

  // Draft preview
  if (response.draft) {
    const preview =
      response.draft.body.length > 300
        ? `${response.draft.body.slice(0, 297)}...`
        : response.draft.body;
    blocks.push(
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Draft Preview:*\n\`\`\`${preview}\`\`\``,
        },
      },
    );
  }

  blocks.push({ type: "divider" });

  // Action buttons
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "✅ Approve",
          emoji: true,
        },
        style: "primary",
        action_id: "cos_approve",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "✏️ Edit",
          emoji: true,
        },
        action_id: "cos_edit",
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "❌ Reject",
          emoji: true,
        },
        style: "danger",
        action_id: "cos_reject",
      },
    ],
  });

  return blocks;
}

export function buildAutoHandleMessage({
  summary,
  actionTaken,
}: {
  summary: string;
  actionTaken: string;
}): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `✅ *Auto-handled*\n${summary}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Action taken:* ${actionTaken}`,
      },
    },
  ];
}

export function buildBatchParentMessage(count: number): KnownBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Chief of Staff — ${count} new emails processed`,
        emoji: true,
      },
    },
  ];
}

export function buildFlagOnlyMessage({
  fromEmail,
  subject,
  summary,
  venture,
}: {
  fromEmail: string;
  subject: string;
  summary: string;
  venture: Venture;
}): KnownBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "🚨 Chief of Staff — Urgent Flag",
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*From:*\n${fromEmail}`,
        },
        {
          type: "mrkdwn",
          text: `*Subject:*\n${subject}`,
        },
        {
          type: "mrkdwn",
          text: `*Venture:*\n${venture}`,
        },
      ],
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Summary:*\n${summary}`,
      },
    },
  ];
}
