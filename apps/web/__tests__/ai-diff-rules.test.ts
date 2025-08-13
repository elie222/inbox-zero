import { describe, it, expect, vi } from "vitest";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";
import { getEmailAccount } from "@/__tests__/helpers";

// RUN_AI_TESTS=true pnpm test-ai ai-diff-rules

const isAiTest = process.env.RUN_AI_TESTS === "true";

vi.mock("server-only", () => ({}));

describe.runIf(isAiTest)("aiDiffRules", () => {
  it("should correctly identify added, edited, and removed rules", async () => {
    const emailAccount = getEmailAccount();

    const oldPromptFile = `
* Label receipts as "Receipt"
* Archive all newsletters and label them "Newsletter"
* Archive all marketing emails and label them "Marketing"
* Label all emails from mycompany.com as "Internal"
    `.trim();

    const newPromptFile = `
* Archive all newsletters and label them "Newsletter Updates"
* Archive all marketing emails and label them "Marketing"
* Label all emails from mycompany.com as "Internal"
* Label all emails from support@company.com as "Support"
    `.trim();

    const result = await aiDiffRules({
      emailAccount,
      oldPromptFile,
      newPromptFile,
    });

    expect(result).toEqual({
      addedRules: ['* Label all emails from support@company.com as "Support"'],
      editedRules: [
        {
          oldRule: `* Archive all newsletters and label them "Newsletter"`,
          newRule: `* Archive all newsletters and label them "Newsletter Updates"`,
        },
      ],
      removedRules: [`* Label receipts as "Receipt"`],
    });
  }, 15_000);

  it("should handle errors gracefully", async () => {
    const emailAccount = {
      ...getEmailAccount(),
      user: { ...getEmailAccount().user, aiApiKey: "invalid-api-key" },
    };
    const oldPromptFile = "Some old prompt";
    const newPromptFile = "Some new prompt";

    await expect(
      aiDiffRules({ emailAccount, oldPromptFile, newPromptFile }),
    ).rejects.toThrow();
  });
});
