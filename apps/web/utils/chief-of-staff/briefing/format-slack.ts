import type { KnownBlock } from "@slack/types";

export function formatBriefingForSlack(
  markdown: string,
  generatedAt: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [];

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "Daily Executive Briefing",
      emoji: true,
    },
  });

  blocks.push({ type: "divider" });

  // Split markdown into sections by ### headings
  const sections = markdown.split(/^### /m).filter(Boolean);

  for (const section of sections) {
    const lines = section.split("\n");
    const title = lines[0]?.trim();
    const body = lines.slice(1).join("\n").trim();

    if (title) {
      blocks.push({
        type: "header",
        text: {
          type: "plain_text",
          text: title,
          emoji: true,
        },
      });
    }

    if (body) {
      // Slack section blocks have a 3000 char limit for mrkdwn text
      const chunks = splitTextForSlack(body, 3000);
      for (const chunk of chunks) {
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: chunk },
        });
      }
    }

    blocks.push({ type: "divider" });
  }

  const contextBlock: KnownBlock = {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Generated at ${generatedAt} CT`,
      },
    ],
  };

  // Slack rejects payloads with more than 50 blocks
  const MAX_SLACK_BLOCKS = 50;
  if (blocks.length >= MAX_SLACK_BLOCKS) {
    blocks.length = MAX_SLACK_BLOCKS - 1;
  }
  blocks.push(contextBlock);

  return blocks;
}

function splitTextForSlack(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const cutoff = remaining.lastIndexOf("\n", maxLen);
    const splitAt = cutoff > 0 ? cutoff : maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
