import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  isLabelLearningSuppressed,
  suppressLabelLearning,
} from "@/utils/redis/label-learning-suppression";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
  },
}));

const logger = createScopedLogger("test");

describe("label-learning-suppression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks each label with a per-label expiring key", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    await suppressLabelLearning({
      emailAccountId: "account-1",
      threadId: "thread-1",
      labelIds: ["label-a", "label-b"],
      logger,
    });

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(redis.set).toHaveBeenCalledWith(
      "label-learning-suppression:account-1:thread-1:label-a",
      "true",
      { ex: 600 },
    );
    expect(redis.set).toHaveBeenCalledWith(
      "label-learning-suppression:account-1:thread-1:label-b",
      "true",
      { ex: 600 },
    );
  });

  it("reports a suppressed label", async () => {
    vi.mocked(redis.get).mockResolvedValue("true");

    const suppressed = await isLabelLearningSuppressed({
      emailAccountId: "account-1",
      threadId: "thread-1",
      labelId: "label-a",
      logger,
    });

    expect(suppressed).toBe(true);
    expect(redis.get).toHaveBeenCalledWith(
      "label-learning-suppression:account-1:thread-1:label-a",
    );
  });

  it("reports an unsuppressed label", async () => {
    vi.mocked(redis.get).mockResolvedValue(null);

    const suppressed = await isLabelLearningSuppressed({
      emailAccountId: "account-1",
      threadId: "thread-1",
      labelId: "label-other",
      logger,
    });

    expect(suppressed).toBe(false);
  });

  it("fails open when redis errors", async () => {
    vi.mocked(redis.get).mockRejectedValue(new Error("redis down"));
    vi.mocked(redis.set).mockRejectedValue(new Error("redis down"));

    await expect(
      suppressLabelLearning({
        emailAccountId: "account-1",
        threadId: "thread-1",
        labelIds: ["label-a"],
        logger,
      }),
    ).resolves.toBeUndefined();

    await expect(
      isLabelLearningSuppressed({
        emailAccountId: "account-1",
        threadId: "thread-1",
        labelId: "label-a",
        logger,
      }),
    ).resolves.toBe(false);
  });
});
