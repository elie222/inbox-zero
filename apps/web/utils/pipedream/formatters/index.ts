import type {
  BriefingContent,
  InternalTeamMember,
} from "@inboxzero/resend/emails/meeting-briefing";
import type { ChannelType } from "../notification-channels";

export type MeetingBriefFormatParams = {
  meetingTitle: string;
  formattedTime: string;
  briefingContent: BriefingContent;
  internalTeamMembers?: InternalTeamMember[];
  videoConferenceLink?: string;
  eventUrl?: string;
};

/**
 * Format a meeting brief for a specific notification channel
 * Returns the configured_props to pass to the Pipedream action
 */
export function formatMeetingBriefForChannel(
  channelType: ChannelType,
  params: MeetingBriefFormatParams,
  channelConfig: Record<string, unknown>,
): Record<string, unknown> {
  switch (channelType) {
    case "slack":
      return formatForSlack(params, channelConfig);
    case "teams":
      return formatForTeams(params, channelConfig);
    case "telegram":
      return formatForTelegram(params, channelConfig);
    case "discord":
      return formatForDiscord(params, channelConfig);
    default:
      throw new Error(`Unsupported channel type: ${channelType}`);
  }
}

/**
 * Format meeting brief for Slack using Block Kit
 */
function formatForSlack(
  params: MeetingBriefFormatParams,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const {
    meetingTitle,
    formattedTime,
    briefingContent,
    internalTeamMembers,
    videoConferenceLink,
    eventUrl,
  } = params;

  const text = `Meeting Brief: ${meetingTitle} at ${formattedTime}`;

  const blocks: unknown[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📅 ${meetingTitle}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Time:* ${formattedTime}`,
      },
    },
  ];

  // Add meeting links
  const links: string[] = [];
  if (videoConferenceLink) {
    links.push(`<${videoConferenceLink}|Join Video Call>`);
  }
  if (eventUrl) {
    links.push(`<${eventUrl}|View in Calendar>`);
  }
  if (links.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: links.join(" | ") },
    });
  }

  blocks.push({ type: "divider" });

  // Add guest information
  if (briefingContent.guests && briefingContent.guests.length > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*👥 Attendees*" },
    });

    for (const guest of briefingContent.guests) {
      const guestInfo: string[] = [];
      if (guest.name) guestInfo.push(`*${guest.name}*`);
      if (guest.email) guestInfo.push(`(${guest.email})`);

      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: guestInfo.join(" ") },
      });

      if (guest.bullets && guest.bullets.length > 0) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: guest.bullets.map((b) => `• ${b}`).join("\n"),
            },
          ],
        });
      }
    }
  }

  // Add internal team members
  if (internalTeamMembers && internalTeamMembers.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*🏢 Internal Team*" },
    });
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: internalTeamMembers
            .map((m) => `• ${m.name || m.email}`)
            .join("\n"),
        },
      ],
    });
  }

  return {
    channel: config.channel,
    text,
    blocks,
  };
}

/**
 * Format meeting brief for Microsoft Teams using Adaptive Cards
 */
function formatForTeams(
  params: MeetingBriefFormatParams,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const {
    meetingTitle,
    formattedTime,
    briefingContent,
    internalTeamMembers,
    videoConferenceLink,
    eventUrl,
  } = params;

  const body: unknown[] = [
    {
      type: "TextBlock",
      text: `📅 ${meetingTitle}`,
      weight: "bolder",
      size: "large",
    },
    {
      type: "TextBlock",
      text: `**Time:** ${formattedTime}`,
    },
  ];

  // Add meeting links
  const actions: unknown[] = [];
  if (videoConferenceLink) {
    actions.push({
      type: "Action.OpenUrl",
      title: "Join Video Call",
      url: videoConferenceLink,
    });
  }
  if (eventUrl) {
    actions.push({
      type: "Action.OpenUrl",
      title: "View in Calendar",
      url: eventUrl,
    });
  }

  // Add guest information
  if (briefingContent.guests && briefingContent.guests.length > 0) {
    body.push({
      type: "TextBlock",
      text: "👥 **Attendees**",
      weight: "bolder",
      spacing: "medium",
    });

    for (const guest of briefingContent.guests) {
      const guestText = [
        guest.name ? `**${guest.name}**` : "",
        guest.email ? `(${guest.email})` : "",
      ]
        .filter(Boolean)
        .join(" ");

      body.push({ type: "TextBlock", text: guestText, wrap: true });

      if (guest.bullets && guest.bullets.length > 0) {
        body.push({
          type: "TextBlock",
          text: guest.bullets.map((b) => `• ${b}`).join("\n"),
          wrap: true,
          color: "default",
          size: "small",
        });
      }
    }
  }

  // Add internal team
  if (internalTeamMembers && internalTeamMembers.length > 0) {
    body.push({
      type: "TextBlock",
      text: "🏢 **Internal Team**",
      weight: "bolder",
      spacing: "medium",
    });
    body.push({
      type: "TextBlock",
      text: internalTeamMembers.map((m) => `• ${m.name || m.email}`).join("\n"),
      wrap: true,
    });
  }

  const card = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body,
    actions: actions.length > 0 ? actions : undefined,
  };

  return {
    teamId: config.teamId,
    channelId: config.channelId,
    message: JSON.stringify(card),
  };
}

/**
 * Format meeting brief for Telegram (Markdown)
 */
function formatForTelegram(
  params: MeetingBriefFormatParams,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const {
    meetingTitle,
    formattedTime,
    briefingContent,
    internalTeamMembers,
    videoConferenceLink,
    eventUrl,
  } = params;

  const lines: string[] = [
    `📅 *${escapeMarkdown(meetingTitle)}*`,
    `⏰ ${escapeMarkdown(formattedTime)}`,
    "",
  ];

  // Add links
  if (videoConferenceLink) {
    lines.push(`🔗 [Join Video Call](${videoConferenceLink})`);
  }
  if (eventUrl) {
    lines.push(`📆 [View in Calendar](${eventUrl})`);
  }
  if (videoConferenceLink || eventUrl) {
    lines.push("");
  }

  // Add guests
  if (briefingContent.guests && briefingContent.guests.length > 0) {
    lines.push("👥 *Attendees*");
    for (const guest of briefingContent.guests) {
      const name = guest.name || guest.email || "Unknown";
      lines.push(`• *${escapeMarkdown(name)}*`);

      if (guest.bullets && guest.bullets.length > 0) {
        for (const bullet of guest.bullets) {
          lines.push(`  └ ${escapeMarkdown(bullet)}`);
        }
      }
    }
    lines.push("");
  }

  // Add internal team
  if (internalTeamMembers && internalTeamMembers.length > 0) {
    lines.push("🏢 *Internal Team*");
    for (const member of internalTeamMembers) {
      lines.push(`• ${escapeMarkdown(member.name || member.email)}`);
    }
    lines.push("");
  }

  return {
    chat_id: config.chatId,
    text: lines.join("\n"),
    parse_mode: "Markdown",
  };
}

/**
 * Format meeting brief for Discord (Embed)
 */
function formatForDiscord(
  params: MeetingBriefFormatParams,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const {
    meetingTitle,
    formattedTime,
    briefingContent,
    internalTeamMembers,
    videoConferenceLink,
    eventUrl,
  } = params;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  // Add time
  fields.push({ name: "⏰ Time", value: formattedTime, inline: true });

  // Add links
  const links: string[] = [];
  if (videoConferenceLink) {
    links.push(`[Join Video Call](${videoConferenceLink})`);
  }
  if (eventUrl) {
    links.push(`[View in Calendar](${eventUrl})`);
  }
  if (links.length > 0) {
    fields.push({ name: "🔗 Links", value: links.join(" | "), inline: true });
  }

  // Add guests
  if (briefingContent.guests && briefingContent.guests.length > 0) {
    const guestLines: string[] = [];
    for (const guest of briefingContent.guests) {
      const name = guest.name || guest.email || "Unknown";
      guestLines.push(`**${name}**`);

      if (guest.bullets && guest.bullets.length > 0) {
        for (const bullet of guest.bullets.slice(0, 2)) {
          guestLines.push(`> ${bullet}`);
        }
      }
    }
    const attendeesValue = guestLines.join("\n");
    fields.push({
      name: "👥 Attendees",
      value: attendeesValue.slice(0, 1024),
    });
  }

  // Add internal team
  if (internalTeamMembers && internalTeamMembers.length > 0) {
    fields.push({
      name: "🏢 Internal Team",
      value: internalTeamMembers.map((m) => m.name || m.email).join(", "),
    });
  }

  const embed = {
    title: `📅 ${meetingTitle}`,
    color: 0x58_65_f2, // Discord blurple
    fields,
  };

  return {
    channel_id: config.channelId,
    embeds: [embed],
  };
}

/**
 * Escape special characters for Telegram Markdown
 */
function escapeMarkdown(text: string): string {
  // Escape backslash first, then other special characters
  return text.replace(/\\/g, "\\\\").replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
