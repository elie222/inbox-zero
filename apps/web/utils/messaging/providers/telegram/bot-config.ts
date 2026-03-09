import { callTelegramBotApi } from "@/utils/messaging/providers/telegram/api";

type TelegramBotCommand = {
  command: string;
  description: string;
};

type TelegramUser = {
  id: number;
};

type TelegramUserProfilePhotos = {
  total_count: number;
};

export const TELEGRAM_BOT_COMMANDS: TelegramBotCommand[] = [
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

export async function configureTelegramBotMetadata({
  botToken,
  profilePhotoUrl,
}: {
  botToken: string;
  profilePhotoUrl?: string;
}) {
  await setTelegramBotCommands({ botToken });

  if (!profilePhotoUrl) return;

  await setTelegramProfilePhotoIfMissing({
    botToken,
    profilePhotoUrl,
  });
}

async function setTelegramBotCommands({ botToken }: { botToken: string }) {
  const body = new URLSearchParams({
    commands: JSON.stringify(TELEGRAM_BOT_COMMANDS),
  });

  await callTelegramBotApi({
    botToken,
    apiMethod: "setMyCommands",
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
    apiMethod: "setMyProfilePhoto",
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
    apiMethod: "getMe",
  });

  const profilePhotos = await callTelegramBotApi<TelegramUserProfilePhotos>({
    botToken,
    apiMethod: "getUserProfilePhotos",
    body: new URLSearchParams({
      user_id: String(me.id),
      limit: "1",
    }),
  });

  return profilePhotos.total_count > 0;
}
