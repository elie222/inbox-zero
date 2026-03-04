// Run with: `pnpm --filter inbox-zero-ai exec tsx scripts/setup-telegram-bot.ts`
// Optional profile photo: `pnpm --filter inbox-zero-ai exec tsx scripts/setup-telegram-bot.ts --profile-photo-url https://example.com/bot.png`
// Local shortcut: `pnpm --filter inbox-zero-ai telegram:setup -- --profile-photo-url https://example.com/bot.png`

import "dotenv/config";
import { configureTelegramBotMetadata } from "@/utils/messaging/providers/telegram/bot-config";

type SetupOptions = {
  botToken: string;
  profilePhotoUrl?: string;
};

async function main() {
  const options = parseSetupOptions(process.argv.slice(2));

  await configureTelegramBotMetadata(options);

  console.log("Telegram bot commands configured.");

  if (options.profilePhotoUrl) {
    console.log("Telegram profile photo setup completed.");
  }
}

function parseSetupOptions(args: string[]): SetupOptions {
  let botToken = process.env.TELEGRAM_BOT_TOKEN;
  let profilePhotoUrl: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    if (arg === "--bot-token") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --bot-token");
      botToken = value;
      i += 1;
      continue;
    }

    if (arg === "--profile-photo-url") {
      const value = args[i + 1];
      if (!value) throw new Error("Missing value for --profile-photo-url");
      profilePhotoUrl = value;
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!botToken) {
    throw new Error(
      "Missing Telegram bot token. Set TELEGRAM_BOT_TOKEN or pass --bot-token.",
    );
  }

  return {
    botToken,
    ...(profilePhotoUrl ? { profilePhotoUrl } : {}),
  };
}

function printHelpAndExit(): never {
  console.log("Usage: tsx scripts/setup-telegram-bot.ts [options]");
  console.log();
  console.log("Options:");
  console.log("  --bot-token <token>          Telegram bot token");
  console.log("  --profile-photo-url <url>    Optional profile photo URL");
  console.log("  -h, --help                   Show this help message");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
