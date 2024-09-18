import { describe, it, expect, vi } from "vitest";
import { aiDiffRules } from "@/utils/ai/rule/diff-rules";

vi.mock("server-only", () => ({}));

describe("aiDiffRules", () => {
  it("should correctly identify added, edited, and removed rules", async () => {
    const user = {
      email: "user@test.com",
      aiModel: null,
      aiProvider: null,
      aiApiKey: null,
    };

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

    const result = await aiDiffRules({ user, oldPromptFile, newPromptFile });

    expect(result).toEqual({
      addedRules: ['Label all emails from support@company.com as "Support"'],
      editedRules: [
        'Archive all newsletters and label them "Newsletter Updates"',
      ],
      removedRules: ['Label receipts as "Receipt"'],
    });
  });

  it("should handle errors gracefully", async () => {
    const user = {
      email: "test@example.com",
      aiProvider: null,
      aiModel: null,
      aiApiKey: "invalid-api-key",
    };
    const oldPromptFile = "Some old prompt";
    const newPromptFile = "Some new prompt";

    await expect(
      aiDiffRules({ user, oldPromptFile, newPromptFile }),
    ).rejects.toThrow();
  });
});
