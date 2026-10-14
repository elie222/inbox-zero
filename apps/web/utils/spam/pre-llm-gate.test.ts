import { describe, expect, it, vi } from "vitest";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { findMatchingRules } from "@/utils/ai/choose-rule/match-rules";
import { filterSpam } from "./gate";
import { createScopedLogger } from "@/utils/logger";
import { getMockMessage } from "@/__tests__/helpers";
vi.mock("./gate", () => ({ filterSpam: vi.fn() }));
vi.mock("@/utils/ai/choose-rule/match-rules", () => ({
  findMatchingRules: vi.fn(),
}));

describe("pre-LLM spam gate", () => {
  it("does not continue to the LLM when extraction fails", async () => {
    vi.mocked(findMatchingRules).mockClear();
    vi.mocked(filterSpam).mockRejectedValueOnce(new Error("extraction limit"));
    await expect(
      runRules({
        provider: {} as never,
        emailAccount: { id: "account" } as never,
        message: getMockMessage(),
        rules: [],
        isTest: false,
        modelType: "default",
        logger: createScopedLogger("spam-test"),
      }),
    ).rejects.toThrow("extraction limit");
    expect(findMatchingRules).not.toHaveBeenCalled();
  });
  it("stops before rule matching or drafting when spam is detected", async () => {
    vi.mocked(filterSpam).mockResolvedValue({
      spam: true,
      score: 0.99,
      corrected: false,
    });
    const result = await runRules({
      provider: {} as never,
      emailAccount: { id: "account" } as never,
      message: getMockMessage(),
      rules: [],
      isTest: false,
      modelType: "default",
      logger: createScopedLogger("spam-test"),
    });
    expect(findMatchingRules).not.toHaveBeenCalled();
    expect(result[0].reason).toContain("99.0%");
  });
});
