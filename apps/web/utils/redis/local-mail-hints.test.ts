import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";
import {
  publishLocalMailHint,
  refreshLocalMailInterest,
} from "./local-mail-hints";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/redis", () => ({
  redis: { exists: vi.fn(), set: vi.fn(), publish: vi.fn() },
}));
const logger = createScopedLogger("local-mail-hints-test");

describe("local mail hints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it("does not publish or reserve a cooldown without a connected Mail client", async () => {
    vi.mocked(redis.exists).mockResolvedValue(0);
    await publishLocalMailHint("account-a", logger);
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.publish).not.toHaveBeenCalled();
  });
  it("coalesces duplicate notifications and publishes no message data", async () => {
    vi.mocked(redis.exists).mockResolvedValue(1);
    vi.mocked(redis.set)
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(null);
    await publishLocalMailHint("account-a", logger);
    await publishLocalMailHint("account-a", logger);
    expect(redis.publish).toHaveBeenCalledExactlyOnceWith(
      "local-mail:account-a",
      "{}",
    );
    expect(redis.set).toHaveBeenCalledWith(
      "local-mail-hint-cooldown:account-a",
      "1",
      { nx: true, ex: 2 },
    );
  });
  it("bounds interest after disconnect without deleting other clients' leases", async () => {
    await refreshLocalMailInterest("account-a");
    expect(redis.set).toHaveBeenCalledWith(
      "local-mail-interest:account-a",
      "1",
      { ex: 75 },
    );
  });
  it.each([
    "exists",
    "set",
    "publish",
  ] as const)("fails open when Redis %s fails", async (method) => {
    vi.mocked(redis.exists).mockResolvedValue(1);
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis[method]).mockRejectedValue(new Error("Unavailable"));
    await expect(
      publishLocalMailHint("account-a", logger),
    ).resolves.toBeUndefined();
  });
});
