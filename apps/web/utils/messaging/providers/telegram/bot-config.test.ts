import { describe, expect, it } from "vitest";
import { TELEGRAM_BOT_COMMANDS } from "./bot-config";

describe("TELEGRAM_BOT_COMMANDS", () => {
  it("includes all expected commands", () => {
    const commands = TELEGRAM_BOT_COMMANDS.map((c) => c.command);
    expect(commands).toEqual([
      "connect",
      "switch",
      "help",
      "cleanup",
      "summary",
      "draftreply",
      "followups",
    ]);
  });
});
