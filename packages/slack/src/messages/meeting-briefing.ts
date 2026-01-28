import type { KnownBlock, Block } from "@slack/web-api";

type GuestBriefing = {
  name: string;
  email: string;
  bullets: string[];
};

type InternalTeamMember = {
  name?: string;
  email: string;
};

type BriefingContent = {
  guests: GuestBriefing[];
  internalTeamMembers?: InternalTeamMember[];
};

export type MeetingBriefingBlocksParams = {
  meetingTitle: string;
  formattedTime: string;
  videoConferenceLink?: string;
  eventUrl?: string;
  briefingContent: BriefingContent;
};

export function buildMeetingBriefingBlocks({
  meetingTitle,
  formattedTime,
  videoConferenceLink,
  eventUrl,
  briefingContent,
}: MeetingBriefingBlocksParams): (KnownBlock | Block)[] {
  const blocks: (KnownBlock | Block)[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Briefing: ${meetingTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Starting at* ${formattedTime}`,
      },
    },
  ];

  const links: string[] = [];
  if (videoConferenceLink) {
    links.push(`<${videoConferenceLink}|Join Meeting>`);
  }
  if (eventUrl) {
    links.push(`<${eventUrl}|View Calendar Event>`);
  }

  if (links.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: links.join(" | "),
      },
    });
  }

  blocks.push({ type: "divider" });

  for (const guest of briefingContent.guests) {
    const bulletsText = guest.bullets.map((b) => `• ${b}`).join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${guest.name}* (${guest.email})\n${bulletsText}`,
      },
    });
  }

  if (
    briefingContent.internalTeamMembers &&
    briefingContent.internalTeamMembers.length > 0
  ) {
    const names = briefingContent.internalTeamMembers
      .map((m) => m.name || m.email)
      .join(", ");

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_Also attending: ${names} (internal team)_`,
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "_AI-generated briefing from Inbox Zero • May contain inaccuracies_",
      },
    ],
  });

  return blocks;
}
