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
const provider = vi.hoisted(() => ({
  getMessage: vi.fn(),
  getMessageByRfc822MessageId: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => provider),
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
  provider.getMessage.mockReset().mockResolvedValue(getMockMessage());
  provider.getMessageByRfc822MessageId.mockReset();
  vi.mocked(enabledSpamModel).mockResolvedValue({ id: "model" } as never);
  vi.mocked(prisma.spamDecision.findUnique).mockResolvedValue(null);
});
describe("Junk correction provenance", () => {
  it("learns a rescue when spam routing and the manual move both happen between snapshots", async () => {
    vi.mocked(prisma.spamDecision.findUnique).mockResolvedValue({
      verdict: "spam",
      moveStartedAt: new Date(1500),
      movedAt: new Date(1600),
    } as never);
    expect(
      await learnSpamCorrection(
        "account",
        {
          ...change,
          after: { ...change.after, targets: ["Personal"] },
        },
        logger,
      ),
    ).toBe("learned");
    expect(applySpamTraining).toHaveBeenCalledWith(
      expect.objectContaining({ label: "good" }),
    );
  });

  it("does not treat an ordinary folder change as a rescue of an old spam decision", async () => {
    vi.mocked(prisma.spamDecision.findUnique).mockResolvedValue({
      verdict: "spam",
      moveStartedAt: new Date(100),
      movedAt: new Date(200),
    } as never);
    expect(
      await learnSpamCorrection(
        "account",
        {
          ...change,
          after: { ...change.after, targets: ["Personal"] },
        },
        logger,
      ),
    ).toBe("ignored");
    expect(applySpamTraining).not.toHaveBeenCalled();
  });

  it("trains on the full relocated message when a Junk rescue changes its ID", async () => {
    const message = getMockMessage({ id: "relocated" });
    provider.getMessage
      .mockRejectedValueOnce(new Error("Original ID is unavailable"))
      .mockResolvedValueOnce(message);
    provider.getMessageByRfc822MessageId.mockResolvedValue({ id: "relocated" });

    await learnSpamCorrection(
      "account",
      {
        ...change,
        before: { ...before, targets: ["@junk"] },
        after: {
          ...change.after,
          targets: ["Personal"],
          rfcMessageId: "<message@example.test>",
        },
      },
      logger,
    );

    expect(applySpamTraining).toHaveBeenCalledWith(
      expect.objectContaining({ message, label: "good" }),
    );
  });
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
