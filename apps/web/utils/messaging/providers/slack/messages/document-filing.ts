import type { KnownBlock, Block } from "@slack/types";

export type DocumentFiledBlocksParams = {
  filename: string;
  folderPath: string;
  driveProvider: string;
};

export type DocumentAskBlocksParams = {
  filename: string;
  reasoning: string | null;
};

export function buildDocumentFiledBlocks({
  filename,
  folderPath,
  driveProvider,
}: DocumentFiledBlocksParams): (KnownBlock | Block)[] {
  const driveName = driveProvider === "google" ? "Google Drive" : "OneDrive";

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Filed: ${filename}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Folder:* ${folderPath}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_${driveName} \u2022 Auto-filed by Inbox Zero_`,
        },
      ],
    },
  ];
}

export function buildDocumentAskBlocks({
  filename,
  reasoning,
}: DocumentAskBlocksParams): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Where should I file ${filename}?`,
        emoji: true,
      },
    },
  ];

  if (reasoning) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: reasoning,
      },
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "_Reply to the email notification to tell me where to put it._",
      },
    ],
  });

  return blocks;
}
