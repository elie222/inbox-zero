import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { upsertDigest } from "@/app/api/ai/digest/upsert-digest";
import { reserveDigestSummarySlot } from "@/utils/digest/summary-limit";
import { createTestLogger } from "@/__tests__/helpers";
import { redis } from "@/utils/redis";

vi.mock("@/utils/redis", () => ({ redis: { eval: vi.fn() } }));

const logger = createTestLogger();

describe.skipIf(!process.env.RUN_DB_TESTS)("pending digest uniqueness", () => {
  const email = "pending-digest-test@example.com";
  let emailAccountId: string;

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email } });
    const user = await prisma.user.create({ data: { email } });
    const account = await prisma.account.create({
      data: {
        userId: user.id,
        provider: "google",
        providerAccountId: email,
        type: "oauth",
      },
    });
    const emailAccount = await prisma.emailAccount.create({
      data: { email, userId: user.id, accountId: account.id },
    });
    emailAccountId = emailAccount.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
  });

  it("keeps concurrent summaries in one digest without repeating a message", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        upsertDigest({
          emailAccountId,
          messageId: `message-${i % 3}`,
          threadId: `thread-${i % 3}`,
          content: { content: "Summary" },
          logger,
        }),
      ),
    );

    const digests = await prisma.digest.findMany({
      where: { emailAccountId },
      include: { items: true },
    });
    expect(digests).toHaveLength(1);
    expect(digests[0].status).toBe("PENDING");
    expect(digests[0].items.map((item) => item.messageId).sort()).toEqual([
      "message-0",
      "message-1",
      "message-2",
    ]);
  });

  it("reserves every fallback slot while the normal writer creates a digest", async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error("Redis unavailable"));
    const [, reservations] = await Promise.all([
      upsertDigest({
        emailAccountId,
        messageId: "message",
        threadId: "thread",
        content: { content: "Summary" },
        logger,
      }),
      Promise.all(
        Array.from({ length: 8 }, () =>
          reserveDigestSummarySlot({ emailAccountId, maxSummariesPer24h: 50 }),
        ),
      ),
    ]);
    expect(reservations.every((reservation) => reservation.reserved)).toBe(
      true,
    );
    const digests = await prisma.digest.findMany({
      where: { emailAccountId },
      include: { items: true },
    });
    expect(digests).toHaveLength(1);
    expect(digests[0].items).toHaveLength(9);
  });

  it("allows a new pending digest while an older one is processing", async () => {
    const oldDigest = await prisma.digest.create({
      data: { emailAccountId, status: "PROCESSING" },
    });
    await upsertDigest({
      emailAccountId,
      messageId: "message",
      threadId: "thread",
      content: { content: "Summary" },
      logger,
    });
    const digests = await prisma.digest.findMany({ where: { emailAccountId } });
    expect(digests.map((digest) => digest.status).sort()).toEqual([
      "PENDING",
      "PROCESSING",
    ]);
    expect(digests.find((digest) => digest.id === oldDigest.id)?.status).toBe(
      "PROCESSING",
    );
  });
});
