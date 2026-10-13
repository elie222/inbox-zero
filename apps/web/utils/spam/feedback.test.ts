import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";
import { learnSpamCorrection } from "./feedback";
import { applySpamTraining, enabledSpamModel } from "./store";
import prisma from "@/utils/prisma";

vi.mock("./store", () => ({
  enabledSpamModel: vi.fn(),
  applySpamTraining: vi.fn(),
}));
vi.mock("./media", () => ({
  extractSpamFeatures: vi.fn(async () => ({
    tokens: new Map([["invoice", 1]]),
  })),
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(async () => ({ account: { provider: "google" } })),
    },
    spamDecision: { findUnique: vi.fn() },
  },
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => ({
    getMessage: async () => getMockMessage(),
  })),
}));
const before = {
  key: "key",
  messageId: "message",
  threadId: "thread",
  sender: "sender@example.test",
  subject: "Invoice",
  recipients: [],
  targets: ["@inbox"],
  observedAt: 1000,
};
const change = {
  before,
  after: { ...before, targets: ["@junk"], observedAt: 3000 },
  since: 2000,
};
const logger = createScopedLogger("spam-feedback-test");
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enabledSpamModel).mockResolvedValue({ id: "model" } as never);
  vi.mocked(prisma.spamDecision.findUnique).mockResolvedValue(null);
});
describe("Junk correction provenance", () => {
  it("does not train on the filter's own move", async () => {
    vi.mocked(prisma.spamDecision.findUnique).mockResolvedValue({
      moveStartedAt: new Date(2000),
    } as never);
    expect(await learnSpamCorrection("account", change, logger)).toBe(
      "automatic",
    );
    expect(applySpamTraining).not.toHaveBeenCalled();
  });
  it("learns a later manual move despite an older automatic decision", async () => {
    vi.mocked(prisma.spamDecision.findUnique).mockResolvedValue({
      moveStartedAt: new Date(2000),
    } as never);
    expect(
      await learnSpamCorrection(
        "account",
        {
          ...change,
          before: { ...before, observedAt: 5000 },
          since: 6000,
          after: { ...change.after, observedAt: 7000 },
        },
        logger,
      ),
    ).toBe("learned");
    expect(applySpamTraining).toHaveBeenCalledWith(
      expect.objectContaining({ label: "spam" }),
    );
  });
  it("learns good mail when Junk is removed into a category", async () => {
    expect(
      await learnSpamCorrection(
        "account",
        {
          ...change,
          before: { ...before, targets: ["@junk"] },
          after: { ...change.after, targets: ["Purchases"] },
        },
        logger,
      ),
    ).toBe("learned");
    expect(applySpamTraining).toHaveBeenCalledWith(
      expect.objectContaining({ label: "good" }),
    );
  });
});
