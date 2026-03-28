import type { KnownBlock, Block } from "@slack/types";

type AppHomeView = {
  type: "home";
  blocks: (KnownBlock | Block)[];
};

export function buildAppHomeBlocks(): AppHomeView {
  return {
    type: "home",
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Welcome to Inbox Zero",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Your AI email assistant, right here in Slack. Ask questions about your inbox, get meeting briefs, draft replies, and stay on top of what matters.",
        },
      },
      { type: "divider" },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Getting Started",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*1.* Connect your email at <https://www.getinboxzero.com|getinboxzero.com>\n*2.* Link Slack in Settings > Connected Apps\n*3.* Pick a channel for notifications (meeting briefs, filing alerts)\n*4.* DM me or @mention me in any channel to chat about your emails",
        },
      },
      { type: "divider" },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Slash Commands",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            "*`/summary`* — What needs your attention today",
            "*`/draftreply`* — Draft a reply to your top email",
            "*`/cleanup`* — Suggestions to clean up your inbox",
            "*`/followups`* — Emails to follow up on this week",
            "*`/help`* — See all available commands",
          ].join("\n"),
        },
      },
      { type: "divider" },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Chat with Inbox Zero",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: 'Send me a DM or @mention me in a channel. Try:\n• _"What emails did I get from Acme today?"_\n• _"Draft a polite decline to the latest recruiter email"_\n• _"Summarize the thread with Sarah about the Q2 budget"_',
        },
      },
      { type: "divider" },
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Features",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Meeting Briefs* — Get a briefing on attendees before your meetings, delivered to your chosen Slack channel.\n\n*Attachment Filing* — Inbox Zero can auto-file attachments to Google Drive and notify you here.\n\n*AI Automation* — Set up rules to auto-label, archive, or draft replies. Configure at <https://www.getinboxzero.com|getinboxzero.com>.",
        },
      },
      { type: "divider" },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "<https://www.getinboxzero.com|Settings> · <https://www.getinboxzero.com/support|Support> · <https://www.getinboxzero.com/privacy|Privacy Policy>",
          },
        ],
      },
    ],
  };
}
