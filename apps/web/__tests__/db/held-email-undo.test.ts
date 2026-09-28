import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import type { PreparedOperation } from "@inboxzero/mail-core/operations";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = vi.fn().mockResolvedValue({ messageId: "test-message" });
  },
}));

const providerSends = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/utils/email/sent-message-open/sent-message-open.server", () => ({
  sendHtmlEmailWithOpenTracking: vi.fn(async () => {
    providerSends.count += 1;
    // Widens the window in which a racing undo or second worker could slip in.
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { messageId: `sent-${providerSends.count}`, threadId: "thread-1" };
  }),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(async () => fakeProvider()),
}));

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;
const WINDOW_MS = 30_000;

describe.skipIf(!RUN_DB_TESTS)(
  "undo-window sends held by the server (real database)",
  { timeout: 60_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let operations: typeof import("@/utils/mail-api/operations");
    let processDueScheduledEmails: typeof import("@/utils/scheduled-email/service").processDueScheduledEmails;
    let logger: import("@/utils/logger").Logger;
    let emailAccountId: string;

    const accountEmail = "held-email-undo-test@example.com";

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      operations = await import("@/utils/mail-api/operations");
      ({ processDueScheduledEmails } = await import(
        "@/utils/scheduled-email/service"
      ));
      logger = (await import("@/utils/logger")).createScopedLogger(
        "held-email-undo-test",
      );
    });

    beforeEach(async () => {
      providerSends.count = 0;
      await prisma.user.deleteMany({ where: { email: accountEmail } });
      emailAccountId = await seedAccount(prisma, accountEmail);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
      await prisma.$disconnect();
    });

    test("sends a held reply after the window when the client has gone away", async () => {
      const operation = heldSend(emailAccountId, crypto.randomUUID());
      const accepted = await executor().execute(attempt(operation));

      expect(accepted).toMatchObject({ status: "accepted" });
      expect(
        accepted.status === "accepted" && accepted.retryAfterMs,
      ).toBeGreaterThan(WINDOW_MS - 5000);
      expect(providerSends.count).toBe(0);

      await processDueScheduledEmails(logger, afterWindow());
      expect(providerSends.count).toBe(1);

      await expect(
        executor().inspect(inspection(operation)),
      ).resolves.toMatchObject({ status: "confirmed" });
      await processDueScheduledEmails(logger, afterWindow());
      expect(providerSends.count).toBe(1);
    });

    test("never sends a reply undone during its window", async () => {
      const operation = heldSend(emailAccountId, crypto.randomUUID());
      await executor().execute(attempt(operation));

      await expect(
        operations.cancelHeldEngineSend(
          emailAccountId,
          operation.key.operationId,
        ),
      ).resolves.toBe("cancelled");
      await processDueScheduledEmails(logger, afterWindow());

      expect(providerSends.count).toBe(0);
      await expect(executor().inspect(inspection(operation))).resolves.toEqual({
        status: "rejected",
        code: "cancelled",
        targets: [],
      });
    });

    test("an undo that reaches the server before the send stops it", async () => {
      const operation = heldSend(emailAccountId, crypto.randomUUID());

      await expect(
        operations.cancelHeldEngineSend(
          emailAccountId,
          operation.key.operationId,
        ),
      ).resolves.toBe("cancelled");
      const result = await executor().execute(attempt(operation));
      await processDueScheduledEmails(logger, afterWindow());

      expect(result).toMatchObject({ status: "rejected", code: "cancelled" });
      expect(providerSends.count).toBe(0);
    });

    test("reports too late once the held reply has been sent", async () => {
      const operation = heldSend(emailAccountId, crypto.randomUUID());
      await executor().execute(attempt(operation));
      await processDueScheduledEmails(logger, afterWindow());

      await expect(
        operations.cancelHeldEngineSend(
          emailAccountId,
          operation.key.operationId,
        ),
      ).resolves.toBe("too_late");
      expect(providerSends.count).toBe(1);
    });

    test("an undo racing the scheduled send either stops it or loses cleanly", async () => {
      for (let round = 0; round < 8; round += 1) {
        providerSends.count = 0;
        const operation = heldSend(emailAccountId, crypto.randomUUID());
        await executor().execute(attempt(operation));

        // Staggered so the undo lands before, during and after the send.
        const [, undo] = await Promise.all([
          processDueScheduledEmails(logger, afterWindow()),
          delay(round * 6).then(() =>
            operations.cancelHeldEngineSend(
              emailAccountId,
              operation.key.operationId,
            ),
          ),
        ]);

        expect(providerSends.count).toBe(undo === "cancelled" ? 0 : 1);
      }
    });

    test("sends once when the cron, a scheduled callback and the client all deliver it", async () => {
      const operation = heldSend(emailAccountId, crypto.randomUUID());
      await executor().execute(attempt(operation));
      await prisma.scheduledEmail.updateMany({
        where: { emailAccountId },
        data: { sendAt: new Date(Date.now() - 1000) },
      });

      await Promise.all([
        processDueScheduledEmails(logger),
        processDueScheduledEmails(logger),
        executor().inspect(inspection(operation)),
        executor().execute(attempt(operation)),
      ]);

      expect(providerSends.count).toBe(1);
      await expect(
        executor().inspect(inspection(operation)),
      ).resolves.toMatchObject({ status: "confirmed" });
    });

    test("holds the reply's content in its conversation, marked as an undo hold", async () => {
      const operation = heldSend(emailAccountId, crypto.randomUUID());
      await executor().execute(attempt(operation));

      const held = await prisma.scheduledEmail.findFirstOrThrow({
        where: { emailAccountId },
      });
      expect(held).toMatchObject({ heldForUndo: true, threadId: "thread-1" });
      expect(held.payload).toMatchObject({
        email: expect.objectContaining({ subject: "Re: Plans" }),
      });
    });

    function executor() {
      return operations.createEmailProviderOperationExecutor({
        accountId: emailAccountId,
        provider: fakeProvider(),
      });
    }
  },
);

function heldSend(accountId: string, operationId: string): PreparedOperation {
  const nowMs = Date.now();
  return {
    key: { accountId, operationId },
    session: { accountId, generation: "g1" },
    authority: "backend",
    payloadHash: "hash",
    intent: {
      kind: "send",
      frozenDraftId: operationId,
      frozenDraftRevision: 1,
      to: ["ada@example.com"],
      cc: [],
      bcc: [],
      subject: "Re: Plans",
      html: "<p>Thursday works.</p>",
      quotedHtml: "",
      attachmentIds: [],
      replyToMessageId: "message-1",
      replyToConversationId: "thread-1",
      queuedAtMs: nowMs,
      sendAtMs: nowMs + WINDOW_MS,
    },
  };
}

function attempt(operation: PreparedOperation) {
  return {
    operation,
    attemptId: crypto.randomUUID(),
    signal: new AbortController().signal,
  };
}

function inspection(operation: PreparedOperation) {
  return {
    operation,
    receiptId: null,
    signal: new AbortController().signal,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function afterWindow() {
  return new Date(Date.now() + WINDOW_MS + 1000);
}

function fakeProvider() {
  return {
    name: "google",
    async getMessage(id: string) {
      return {
        id,
        threadId: "thread-1",
        headers: { from: "me@example.com", to: "ada@example.com" },
        labelIds: ["SENT"],
        snippet: "Thursday works.",
        historyId: "1",
        textHtml: "<p>Thursday works.</p>",
      };
    },
  } as unknown as EmailProvider;
}

async function seedAccount(
  prisma: typeof import("@/utils/prisma").default,
  email: string,
) {
  const user = await prisma.user.create({ data: { email } });
  const account = await prisma.account.create({
    data: {
      userId: user.id,
      provider: "google",
      providerAccountId: `provider-${email}`,
      type: "oauth",
    },
  });
  const emailAccount = await prisma.emailAccount.create({
    data: { accountId: account.id, email, userId: user.id },
  });
  return emailAccount.id;
}
