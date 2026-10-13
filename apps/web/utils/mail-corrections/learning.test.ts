import { learnObservedSpam } from "@/utils/spam/worker-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { learnCorrection } from "./learning";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import { removeAiLearnedPattern } from "@/utils/rule/learned-patterns";
import prisma from "@/utils/prisma";

vi.mock("@/utils/spam/worker-client", () => ({
  learnObservedSpam: vi.fn().mockResolvedValue("ignored"),
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    iCloudMessage: { findMany: vi.fn() },
    executedAction: { findMany: vi.fn() },
    classificationFeedback: { deleteMany: vi.fn() },
    emailAccount: { update: vi.fn() },
  },
}));
vi.mock("@/utils/rule/classification-feedback", () => ({
  saveClassificationFeedback: vi.fn(),
}));
vi.mock("@/utils/rule/learned-patterns", () => ({
  removeAiLearnedPattern: vi.fn(),
}));
const before = {
  key: "key",
  messageId: "message",
  threadId: "thread",
  sender: "orders@example.com",
  recipients: ["user@example.com"],
  subject: "A purchase receipt",
  targets: ["Services"],
  observedAt: 1000,
};
const options = {
  emailAccountId: "owner",
  change: {
    before,
    after: { ...before, targets: ["Purchases"], observedAt: 3000 },
    since: 2000,
  },
  targets: [
    { name: "Services", ruleId: "services", labelId: "s" },
    { name: "Purchases", ruleId: "purchases", labelId: "p" },
    { name: "Work", ruleId: "work", labelId: "w" },
  ],
  automaticRoutes: [{ target: "Work", recipientDomains: ["business.example"] }],
  logger: createScopedLogger("correction-test"),
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(learnObservedSpam).mockResolvedValue("ignored");
  vi.mocked(prisma.iCloudMessage.findMany).mockResolvedValue([]);
  vi.mocked(prisma.executedAction.findMany).mockResolvedValue([]);
  vi.mocked(removeAiLearnedPattern).mockResolvedValue(0);
});
describe("learning from observed corrections", () => {
  it("learns a Junk rescue even when the destination has no topic rule", async () => {
    vi.mocked(learnObservedSpam).mockResolvedValue("learned");
    expect(
      await learnCorrection({
        ...options,
        change: {
          before: { ...before, targets: ["@junk"] },
          after: { ...before, targets: ["Unconfigured folder"] },
          since: 2000,
        },
      }),
    ).toBe("learned");
    expect(saveClassificationFeedback).not.toHaveBeenCalled();
    expect(learnObservedSpam).toHaveBeenCalledTimes(1);
  });
  it("does not learn from a Junk move made by the Bayesian filter", async () => {
    vi.mocked(learnObservedSpam).mockResolvedValue("automatic");
    expect(
      await learnCorrection({
        ...options,
        change: {
          before,
          after: { ...before, targets: ["@junk"] },
          since: 2000,
        },
      }),
    ).toBe("automatic");
    expect(saveClassificationFeedback).not.toHaveBeenCalled();
  });
  it("saves message examples and replaces contradictory feedback", async () => {
    expect(await learnCorrection(options)).toBe("learned");
    expect(saveClassificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "services",
        eventType: "LABEL_REMOVED",
        subject: before.subject,
      }),
    );
    expect(saveClassificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "purchases",
        eventType: "LABEL_ADDED",
        observedAt: new Date(2000),
      }),
    );
    expect(prisma.classificationFeedback.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        ruleId: "purchases",
        eventType: "LABEL_REMOVED",
        messageId: "message",
      }),
    });
    expect(removeAiLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "services" }),
    );
  });
  it("ignores a recent matching action by Inbox Zero", async () => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      { type: "LABEL", labelId: "p" },
    ] as never);
    expect(await learnCorrection(options)).toBe("automatic");
    expect(saveClassificationFeedback).not.toHaveBeenCalled();
  });
  it("does not suppress a later manual move to a different destination", async () => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      { type: "LABEL", labelId: "s" },
    ] as never);
    expect(await learnCorrection(options)).toBe("learned");
  });
  it("ignores the configured recipient-domain Work automation", async () => {
    expect(
      await learnCorrection({
        ...options,
        change: {
          ...options.change,
          after: {
            ...before,
            recipients: ["owner@business.example"],
            targets: ["Work"],
          },
        },
      }),
    ).toBe("automatic");
    expect(saveClassificationFeedback).not.toHaveBeenCalled();
  });
  it("does not mistake a lookalike recipient domain for automatic routing", async () => {
    expect(
      await learnCorrection({
        ...options,
        change: {
          ...options.change,
          after: {
            ...before,
            recipients: ["owner@business.example.evil.test"],
            targets: ["Work"],
          },
        },
      }),
    ).toBe("learned");
  });
  it("ignores junk deletion without creating a not-spam example", async () => {
    expect(
      await learnCorrection({
        ...options,
        change: {
          ...options.change,
          before: { ...before, targets: ["@junk"] },
          after: { ...before, targets: ["@trash"] },
        },
      }),
    ).toBe("ignored");
    expect(saveClassificationFeedback).not.toHaveBeenCalled();
  });
});
