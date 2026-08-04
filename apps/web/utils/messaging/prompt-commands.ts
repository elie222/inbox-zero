import type { MessagingPlatform } from "@/utils/messaging/platforms";

const SLASH_COMMAND_REGEX = /^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+.*)?$/i;
const HELP_COMMAND_REGEX = /^\/help(?:@[A-Za-z0-9_]+)?\s*$/i;

export const PROMPT_COMMANDS: Record<string, string> = {
  cleanup: "Help me clean up my inbox today.",
  summary: "Summarize what needs attention in my inbox today.",
  draftreply: "Draft a response to my most urgent unread email.",
  followups: "Which emails should I follow up on this week?",
};

const ACCOUNT_COMMAND_LINES = [
  "/connect <code> - Link your Inbox Zero account",
  "/switch - List linked accounts",
  "/switch <number> - Switch active account",
];

const COMMAND_LINES = [
  "/help - Show help and supported commands",
  "/cleanup - Help me clean up my inbox today",
  "/summary - Summarize what needs attention today",
  "/draftreply - Draft a response to my most urgent unread email",
  "/followups - Show emails I should follow up on this week",
];

const SUPPORTED_COMMANDS = new Set([
  "connect",
  "help",
  "switch",
  ...Object.keys(PROMPT_COMMANDS),
]);

const PLATFORM_INTRO: Record<MessagingPlatform, string> = {
  telegram: "I can help you manage your inbox from this Telegram DM.",
  teams:
    "I can help you manage your inbox from this Microsoft Teams direct message.",
  slack: "I can help you manage your inbox from Slack.",
};

type HelpTextOptions = {
  baseUrl: string;
  supportEmail: string;
};

export function expandPromptCommand(text: string): string {
  const command = parseSlashCommand(text);
  if (!command) return text;

  return PROMPT_COMMANDS[command] ?? text;
}

export function isHelpCommand(text: string): boolean {
  return HELP_COMMAND_REGEX.test(text.trim());
}

export function isUnsupportedSlashCommand(text: string): boolean {
  const command = parseSlashCommand(text);
  return command !== null && !SUPPORTED_COMMANDS.has(command);
}

export function getHelpText(
  platform: MessagingPlatform,
  { baseUrl, supportEmail }: HelpTextOptions,
): string {
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const accountCommands = platform === "slack" ? [] : ACCOUNT_COMMAND_LINES;

  return [
    PLATFORM_INTRO[platform],
    "An active Inbox Zero account is required.",
    `Get started: ${normalizedBaseUrl}/channels`,
    `Help: ${normalizedBaseUrl}/docs/essentials/channels`,
    `Contact support: ${supportEmail}`,
    "",
    "Commands:",
    ...accountCommands,
    ...COMMAND_LINES,
  ].join("\n");
}

function parseSlashCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = SLASH_COMMAND_REGEX.exec(trimmed);
  if (!match) return null;

  return match[1]?.toLowerCase() ?? null;
}
