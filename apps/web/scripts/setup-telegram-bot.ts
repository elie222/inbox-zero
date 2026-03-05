// Run with: `pnpm --filter inbox-zero-ai exec tsx scripts/setup-telegram-bot.ts`
// Optional profile photo: `pnpm --filter inbox-zero-ai exec tsx scripts/setup-telegram-bot.ts --profile-photo-url https://example.com/bot.png`
// Local shortcut: `pnpm --filter inbox-zero-ai telegram:setup -- --profile-photo-url https://example.com/bot.png`

import "dotenv/config";
import { configureTelegramBotMetadata } from "@/utils/messaging/providers/telegram/bot-config";

type SetupOptions = {
  botToken: string;
  profilePhotoUrl?: string;
};

type ScriptLogger = {
  info: (message: string) => void;
  error: (message: string, args?: Record<string, unknown>) => void;
};

async function main() {
  const options = parseSetupOptions(process.argv.slice(2));
  const logger = await createLogger();

  await configureTelegramBotMetadata(options);

  logger.info("Telegram bot commands configured.");

  if (options.profilePhotoUrl) {
    logger.info("Telegram profile photo setup completed.");
  }
}

function parseSetupOptions(args: string[]): SetupOptions {
  let botToken = process.env.TELEGRAM_BOT_TOKEN;
  let profilePhotoUrl: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return printHelpAndExit();
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
  process.stdout.write("Usage: tsx scripts/setup-telegram-bot.ts [options]\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --bot-token <token>          Telegram bot token\n");
  process.stdout.write(
    "  --profile-photo-url <url>    Optional profile photo URL\n",
  );
  process.stdout.write(
    "  -h, --help                   Show this help message\n",
  );
  process.exit(0);
}

async function createLogger(): Promise<ScriptLogger> {
  try {
    const { createScopedLogger } = await import("@/utils/logger");
    return createScopedLogger("scripts/setup-telegram-bot");
  } catch {
    return {
      info: (message: string) => {
        process.stdout.write(`${message}\n`);
      },
      error: (message: string, args?: Record<string, unknown>) => {
        const details =
          args && "error" in args && args.error ? ` ${String(args.error)}` : "";
        process.stderr.write(`${message}${details}\n`);
      },
    };
  }
}

main().catch((error) => {
  process.stderr.write(
    `Failed to configure Telegram bot metadata: ${String(error)}\n`,
  );
  process.exit(1);
});
