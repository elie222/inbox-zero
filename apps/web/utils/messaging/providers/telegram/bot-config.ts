import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

type TelegramBotCommand = {
  command: string;
  description: string;
};

type TelegramBotApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramUser = {
  id: number;
};

type TelegramUserProfilePhotos = {
  total_count: number;
};

const TELEGRAM_SLASH_COMMAND_REGEX =
  /^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+.*)?$/i;
const TELEGRAM_HELP_COMMAND_REGEX = /^\/help(?:@[A-Za-z0-9_]+)?\s*$/i;

const TELEGRAM_PROMPT_COMMANDS: Record<string, string> = {
  cleanup: "Help me clean up my inbox today.",
  summary: "Summarize what needs attention in my inbox today.",
  draftreply: "Draft a response to my most urgent unread email.",
  followups: "Which emails should I follow up on this week?",
} as const;

const TELEGRAM_BOT_COMMANDS: TelegramBotCommand[] = [
  {
    command: "connect",
    description: "Link your Inbox Zero account with /connect <code>",
  },
  {
    command: "switch",
    description: "Switch between linked inbox accounts",
  },
  {
    command: "help",
    description: "Show bot commands and prompt shortcuts",
  },
  {
    command: "cleanup",
    description: "Help me clean up my inbox today",
  },
  {
    command: "summary",
    description: "Summarize what needs attention today",
  },
  {
    command: "draftreply",
    description: "Draft a reply to my most urgent unread email",
  },
  {
    command: "followups",
    description: "Show emails I should follow up on this week",
  },
];

const TELEGRAM_HELP_TEXT = [
  "I can help you manage your inbox from this Telegram DM.",
  "",
  "Commands:",
  "/connect <code> - Link your Inbox Zero account",
  "/switch - List linked accounts",
  "/switch <number> - Switch active account",
  "/cleanup - Help me clean up my inbox today",
  "/summary - Summarize what needs attention today",
  "/draftreply - Draft a response to my most urgent unread email",
  "/followups - Show emails I should follow up on this week",
].join("\n");

const logger = createScopedLogger("telegram-bot-setup");

let telegramSetupPromise: Promise<void> | null = null;

export function ensureTelegramBotMetadataConfigured() {
  if (!env.TELEGRAM_BOT_TOKEN || telegramSetupPromise) return;

  telegramSetupPromise = configureTelegramBotMetadata({
    botToken: env.TELEGRAM_BOT_TOKEN,
    profilePhotoUrl: env.TELEGRAM_BOT_PROFILE_PHOTO_URL,
  }).catch((error) => {
    telegramSetupPromise = null;
    logger.warn("Failed to configure Telegram bot metadata", { error });
  });
}

export function expandTelegramPromptCommand(text: string): string {
  const command = parseTelegramSlashCommand(text);
  if (!command) return text;

  return TELEGRAM_PROMPT_COMMANDS[command] ?? text;
}

export function isTelegramHelpCommand(text: string): boolean {
  return TELEGRAM_HELP_COMMAND_REGEX.test(text.trim());
}

export function getTelegramHelpText(): string {
  return TELEGRAM_HELP_TEXT;
}

async function configureTelegramBotMetadata({
  botToken,
  profilePhotoUrl,
}: {
  botToken: string;
  profilePhotoUrl?: string;
}) {
  await setTelegramBotCommands({ botToken });

  if (!profilePhotoUrl) return;

  try {
    await setTelegramProfilePhotoIfMissing({
      botToken,
      profilePhotoUrl,
    });
  } catch (error) {
    logger.warn("Failed to set Telegram bot profile photo", { error });
  }
}

async function setTelegramBotCommands({ botToken }: { botToken: string }) {
  const body = new URLSearchParams({
    commands: JSON.stringify(TELEGRAM_BOT_COMMANDS),
  });

  await callTelegramBotApi({
    botToken,
    method: "setMyCommands",
    body,
  });
}

async function setTelegramProfilePhotoIfMissing({
  botToken,
  profilePhotoUrl,
}: {
  botToken: string;
  profilePhotoUrl: string;
}) {
  const hasProfilePhoto = await hasTelegramProfilePhoto({ botToken });
  if (hasProfilePhoto) return;

  const imageResponse = await fetch(profilePhotoUrl, { cache: "no-store" });
  if (!imageResponse.ok) {
    throw new Error(
      `Failed to fetch Telegram profile photo URL (status ${imageResponse.status})`,
    );
  }

  const imageBytes = await imageResponse.arrayBuffer();
  const contentType =
    imageResponse.headers.get("content-type")?.split(";")[0] || "image/png";

  const body = new FormData();
  body.append(
    "photo",
    JSON.stringify({ type: "static", photo: "attach://profile_photo" }),
  );
  body.append(
    "profile_photo",
    new Blob([imageBytes], { type: contentType }),
    "telegram-profile-photo",
  );

  await callTelegramBotApi({
    botToken,
    method: "setMyProfilePhoto",
    body,
  });
}

async function hasTelegramProfilePhoto({
  botToken,
}: {
  botToken: string;
}): Promise<boolean> {
  const me = await callTelegramBotApi<TelegramUser>({
    botToken,
    method: "getMe",
  });

  const profilePhotos = await callTelegramBotApi<TelegramUserProfilePhotos>({
    botToken,
    method: "getUserProfilePhotos",
    body: new URLSearchParams({
      user_id: String(me.id),
      limit: "1",
    }),
  });

  return profilePhotos.total_count > 0;
}

async function callTelegramBotApi<T>({
  botToken,
  method,
  body,
}: {
  botToken: string;
  method: string;
  body?: BodyInit;
}): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${method}`,
    {
      method: "POST",
      ...(body ? { body } : {}),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram ${method} request failed (${response.status})`);
  }

  const payload = (await response.json()) as TelegramBotApiResponse<T>;
  if (!payload.ok) {
    throw new Error(
      payload.description || `Telegram ${method} returned a failed response`,
    );
  }

  if (!("result" in payload)) {
    throw new Error(`Telegram ${method} returned no result payload`);
  }

  return payload.result as T;
}

function parseTelegramSlashCommand(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = TELEGRAM_SLASH_COMMAND_REGEX.exec(trimmed);
  if (!match) return null;

  return match[1]?.toLowerCase() ?? null;
}
