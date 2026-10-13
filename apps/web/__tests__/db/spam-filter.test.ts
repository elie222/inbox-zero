import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import {
  applySpamTraining,
  resolveSpamTokens,
  withSpamMessageLock,
} from "@/utils/spam/store";
import { spamMessageKey, tokenHash, lookupToken } from "@/utils/spam/identity";
import { filterSpam } from "@/utils/spam/gate";
import { getMockMessage } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import { env } from "@/env";

vi.mock("@/utils/spam/media", () => ({
  extractSpamFeatures: vi.fn(async () => ({
    tokens: new Map([["invoice", 3]]),
    warnings: new Set(),
  })),
}));
const email = "spam-database-test@example.test";
let emailAccountId: string;
let modelId: string;
let safeDatabase = false;
const message = getMockMessage();
const provider = {
  isSentMessage: () => false,
  markMessageSpam: vi.fn(async () => undefined),
  getMessage: vi.fn(async () => ({ ...message, labelIds: ["INBOX"] })),
} as unknown as EmailProvider;

describe.skipIf(!process.env.RUN_DB_TESTS)("Bayesian persistence", () => {
  beforeEach(async () => {
    if (!new URL(env.DATABASE_URL).pathname.includes("_test"))
      throw new Error(
        "Spam database tests require a disposable _test database",
      );
    safeDatabase = true;
    await prisma.user.deleteMany({ where: { email } });
    const user = await prisma.user.create({ data: { email } });
    const account = await prisma.account.create({
      data: { userId: user.id, provider: "google", providerAccountId: email },
    });
    const mailbox = await prisma.emailAccount.create({
      data: {
        accountId: account.id,
        userId: user.id,
        email,
        spamFilterEnabled: true,
      },
    });
    emailAccountId = mailbox.id;
    const model = await prisma.spamModel.create({
      data: {
        userId: user.id,
        sourceDigest: "test",
        sourceMetadata: {},
        status: "READY",
        goodMessages: 10,
        spamMessages: 10,
        tokenizerVersion: "portable-1",
      },
    });
    modelId = model.id;
    await prisma.spamToken.create({
      data: {
        modelId,
        token: "invoice",
        hash: tokenHash("invoice"),
        lookupHash: tokenHash(lookupToken("invoice")),
        normalized: "invoice",
        good: 8,
        spam: 3,
      },
    });
    vi.clearAllMocks();
  });
  afterAll(async () => {
    if (!safeDatabase) return;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("counts a document once, reverses new training and preserves imported baseline", async () => {
    const train = (label: "good" | "spam", time: number) =>
      applySpamTraining({
        emailAccountId,
        message,
        label,
        observedAt: new Date(time),
        tokens: new Map([["invoice", 7]]),
      });
    expect(await train("good", 1000)).toBe(true);
    expect(await train("good", 2000)).toBe(false);
    expect(await train("spam", 3000)).toBe(true);
    expect(await train("good", 1000)).toBe(false);
    expect(
      await prisma.spamToken.findUnique({
        where: { modelId_hash: { modelId, hash: tokenHash("invoice") } },
      }),
    ).toMatchObject({ good: 8, spam: 4 });
    expect(
      await prisma.spamModel.findUnique({ where: { id: modelId } }),
    ).toMatchObject({ goodMessages: 10, spamMessages: 11, revision: 2 });
  });

  it("retains both concurrent corrections to the same model", async () => {
    const results = await Promise.all(
      [
        message,
        {
          ...message,
          id: "second",
          headers: {
            ...message.headers,
            "message-id": "<second@example.test>",
          },
        },
      ].map((item) =>
        applySpamTraining({
          emailAccountId,
          message: item,
          label: "good",
          observedAt: new Date(1000),
          tokens: new Map([["invoice", 1]]),
        }),
      ),
    );
    expect(results).toEqual([true, true]);
    expect(
      await prisma.spamModel.findUnique({ where: { id: modelId } }),
    ).toMatchObject({ goodMessages: 12, revision: 2 });
  });

  it("keeps canonically related imported identities separate and uses an exact match first", async () => {
    for (const token of ["é", "e\u0301"])
      await prisma.spamToken.create({
        data: {
          modelId,
          token,
          hash: tokenHash(token),
          lookupHash: tokenHash(lookupToken(token)),
          normalized: token,
          good: 1,
          spam: 0,
        },
      });
    const result = await resolveSpamTokens(
      modelId,
      new Map([
        ["é", 1],
        ["e\u0301", 2],
      ]),
    );
    expect(result.map((x) => x.token).sort()).toEqual(["é", "e\u0301"].sort());
  });

  it("moves only the scored message once and honors a subsequent rescue", async () => {
    await prisma.spamToken.update({
      where: { modelId_hash: { modelId, hash: tokenHash("invoice") } },
      data: { good: 0, spam: 10 },
    });
    expect(
      (await filterSpam({ emailAccountId, message, provider }))?.spam,
    ).toBe(true);
    expect(
      (await filterSpam({ emailAccountId, message, provider }))?.spam,
    ).toBe(true);
    expect(provider.markMessageSpam).toHaveBeenCalledTimes(1);
    expect(provider.markMessageSpam).toHaveBeenCalledWith(message.id);
    await applySpamTraining({
      emailAccountId,
      message,
      label: "good",
      observedAt: new Date(),
      tokens: new Map([["invoice", 1]]),
    });
    expect(
      (await filterSpam({ emailAccountId, message, provider }))?.spam,
    ).toBe(false);
    expect(provider.markMessageSpam).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a Junk move after an ambiguous provider failure", async () => {
    await prisma.spamToken.update({
      where: { modelId_hash: { modelId, hash: tokenHash("invoice") } },
      data: { good: 0, spam: 10 },
    });
    vi.mocked(provider.markMessageSpam).mockRejectedValueOnce(
      new Error("Connection closed"),
    );
    await expect(
      filterSpam({ emailAccountId, message, provider }),
    ).rejects.toThrow("Connection closed");
    await expect(
      filterSpam({ emailAccountId, message, provider }),
    ).rejects.toThrow("uncertain");
    expect(provider.markMessageSpam).toHaveBeenCalledTimes(1);
  });

  it("does not allow a late worker to acquire a correction's message lock", async () => {
    await withSpamMessageLock(
      emailAccountId,
      spamMessageKey(message),
      async () => {
        await expect(
          filterSpam({ emailAccountId, message, provider }),
        ).rejects.toThrow("already in progress");
      },
    );
    expect(provider.markMessageSpam).not.toHaveBeenCalled();
  });
});
