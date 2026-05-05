import { describe, it, expect, vi, beforeEach } from "vitest";
import { digestContentSchema } from "@/utils/ai/digest/digest-schema";
import {
  DIGEST_SYSTEM_PROMPT,
  buildDigestPrompt,
} from "@/utils/ai/digest/digest-prompt";

vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(),
}));
vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    modelName: "claude-sonnet-4-6",
    provider: "anthropic",
    fallbackModels: [],
    hasUserApiKey: false,
  })),
}));
vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

describe("generateDigestContent — Sonnet batched call", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls createGenerateObject with promptHardening level: 'full'", async () => {
    const { createGenerateObject } = await import("@/utils/llms");
    const fakeGen = vi.fn(async () => ({
      object: {
        narrativeGreeting: "Hi",
        narrativeBody: "ok",
        urgent: [],
        uncertain: [],
        autoFiled: {
          receipts: [],
          newsletters: [],
          marketing: [],
          notifications: [],
        },
      },
    }));
    vi.mocked(createGenerateObject).mockReturnValue(
      fakeGen as unknown as ReturnType<typeof createGenerateObject>,
    );

    const { generateDigestContent } = await import(
      "@/utils/ai/digest/generate-digest-content"
    );
    await generateDigestContent({
      emailAccount: {
        id: "ea1",
        email: "test@example.com",
        userId: "u1",
        user: { id: "u1" },
      } as never,
      todayDate: "Monday, May 4, 2026",
      bucketed: {
        urgent: [],
        uncertain: [],
        receipts: [],
        newsletters: [],
        marketing: [],
        notifications: [],
      },
    });

    expect(createGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        promptHardening: { trust: "untrusted", level: "full" },
        label: "digest-batch-content",
      }),
    );
  });

  it("returns object matching digestContentSchema shape", () => {
    const sample = {
      narrativeGreeting: "Morning, Rebekah —",
      narrativeBody: "Two urgent items, three roll-ups.",
      urgent: [{ messageId: "m1", summary: "Renewal due Friday." }],
      uncertain: [],
      autoFiled: {
        receipts: [
          {
            label: "Starbucks",
            summary: "Two reloads.",
            memberMessageIds: ["m2"],
          },
        ],
        newsletters: [],
        marketing: [],
        notifications: [],
      },
    };
    expect(() => digestContentSchema.parse(sample)).not.toThrow();
  });

  it("system prompt contains all 5 hard-guardrail trigger categories", () => {
    expect(DIGEST_SYSTEM_PROMPT).toMatch(/death.*dying.*terminal illness/);
    expect(DIGEST_SYSTEM_PROMPT).toMatch(
      /divorce.*custody.*eviction.*bankruptcy/,
    );
    expect(DIGEST_SYSTEM_PROMPT).toMatch(/layoff.*termination.*severance/);
    expect(DIGEST_SYSTEM_PROMPT).toMatch(/lawsuit.*subpoena.*cease-and-desist/);
    expect(DIGEST_SYSTEM_PROMPT).toMatch(/medical emergency.*ICU.*surgery/);
  });

  it("buildDigestPrompt interpolates today's date and renders all 6 buckets", () => {
    const out = buildDigestPrompt({
      todayDate: "Monday, May 4, 2026",
      bucketed: {
        urgent: [],
        uncertain: [],
        receipts: [],
        newsletters: [],
        marketing: [],
        notifications: [],
      },
    });
    expect(out).toContain("Today's date: Monday, May 4, 2026.");
    expect(out).toContain("### URGENT");
    expect(out).toContain("### UNCERTAIN");
    expect(out).toContain("### RECEIPTS");
    expect(out).toContain("### NEWSLETTERS");
    expect(out).toContain("### MARKETING");
    expect(out).toContain("### NOTIFICATIONS");
  });
});
