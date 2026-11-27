import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";

vi.mock("server-only", () => ({}));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = vi.fn().mockResolvedValue({ messageId: "test-message" });
  },
}));

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

describe.skipIf(!RUN_DB_TESTS)(
  "snoozed thread scheduler (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let activatePreparedSnoozedThread: typeof import("@/utils/snooze/scheduler").activatePreparedSnoozedThread;
    let claimSnoozePreparation: typeof import("@/utils/snooze/scheduler").claimSnoozePreparation;
    let markSnoozedThreadAsExecuting: typeof import("@/utils/snooze/scheduler").markSnoozedThreadAsExecuting;
    let prepareSnoozedThread: typeof import("@/utils/snooze/scheduler").prepareSnoozedThread;
    let releaseSnoozePreparation: typeof import("@/utils/snooze/scheduler").releaseSnoozePreparation;
    let updateSnoozeArchiveWrite: typeof import("@/utils/snooze/scheduler").updateSnoozeArchiveWrite;
    let withSnoozeMutationLease: typeof import("@/utils/snooze/mutation-lease").withSnoozeMutationLease;
    let emailAccountId: string;

    const accountEmail = "snoozed-thread-scheduler-test@example.com";

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      ({
        activatePreparedSnoozedThread,
        claimSnoozePreparation,
        markSnoozedThreadAsExecuting,
        prepareSnoozedThread,
        releaseSnoozePreparation,
        updateSnoozeArchiveWrite,
      } = await import("@/utils/snooze/scheduler"));
      ({ withSnoozeMutationLease } = await import(
        "@/utils/snooze/mutation-lease"
      ));
    });

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
      emailAccountId = await seedAccount(prisma, accountEmail);
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
      await prisma.$disconnect();
    });

    test("binds a mutation to its original payload even after the restore is delayed", async () => {
      const input = {
        clientMutationId: "payload-bound-snooze",
        clientMutationPayloadHash: "original-payload",
        emailAccountId,
        scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
        threadId: "payload-bound-thread",
      };
      const { snoozedThread } = await prepareSnoozedThread(input);
      const delayedRestore = new Date("2026-08-17T09:05:00.000Z");
      await prisma.snoozedThread.update({
        where: { id: snoozedThread.id },
        data: { scheduledFor: delayedRestore },
      });

      await expect(prepareSnoozedThread(input)).resolves.toMatchObject({
        created: false,
        snoozedThread: { scheduledFor: delayedRestore },
      });
      await expect(
        prepareSnoozedThread({
          ...input,
          clientMutationPayloadHash: "different-payload",
          scheduledFor: delayedRestore,
        }),
      ).rejects.toThrow("Snooze mutation ID was reused with different input");
    });

    test("keeps one active restore when the same thread is scheduled concurrently", async () => {
      const scheduledFor = new Date("2026-08-17T09:00:00.000Z");

      const results = await Promise.allSettled(
        ["mutation-one", "mutation-two"].map(async (clientMutationId) => {
          const input = {
            clientMutationId,
            emailAccountId,
            scheduledFor,
            threadId: "concurrent-thread",
          };
          const { snoozedThread } = await prepareSnoozedThread(input);
          const claim = await claimSnoozePreparation(snoozedThread);
          if (!claim)
            throw new Error("The preparation was unexpectedly claimed");
          return activatePreparedSnoozedThread(input, claim, []);
        }),
      );

      expect(results.every((result) => result.status === "fulfilled")).toBe(
        true,
      );
      const active = await prisma.snoozedThread.findMany({
        where: {
          emailAccountId,
          threadId: "concurrent-thread",
          status: {
            in: [SnoozedThreadStatus.PENDING, SnoozedThreadStatus.EXECUTING],
          },
        },
      });
      expect(active).toHaveLength(1);
      expect(["mutation-one", "mutation-two"]).toContain(
        active[0]?.clientMutationId,
      );
    });

    test("serializes archive claims and records newly eligible rollback targets on retry", async () => {
      const now = new Date("2026-08-17T09:00:00.000Z");
      const input = {
        clientMutationId: "archive-claim",
        emailAccountId,
        scheduledFor: new Date("2026-08-17T10:00:00.000Z"),
        threadId: "archive-claim-thread",
      };
      const { snoozedThread } = await prepareSnoozedThread(input);
      const readReceipt = () =>
        prisma.snoozedThread.findUniqueOrThrow({
          where: { id: snoozedThread.id },
        });
      const folders = { archiveFolderId: "archive", inboxFolderId: "inbox" };
      const dispatch = { inboxMessageIds: ["first"], folders };
      const claims = await Promise.all([
        claimSnoozePreparation(snoozedThread, dispatch, now),
        claimSnoozePreparation(snoozedThread, dispatch, now),
      ]);
      expect(claims.filter(Boolean)).toEqual([now]);
      const retryAt = new Date(now.getTime() + 1);
      expect(
        await claimSnoozePreparation(await readReceipt(), undefined, retryAt),
      ).toBeNull();
      await releaseSnoozePreparation(snoozedThread.id, now);

      expect(
        await claimSnoozePreparation(
          await readReceipt(),
          { inboxMessageIds: ["first", "newly-inbox"] },
          retryAt,
        ),
      ).toEqual(retryAt);
      await releaseSnoozePreparation(snoozedThread.id, now);
      await expect(
        activatePreparedSnoozedThread(input, now, []),
      ).resolves.toBeNull();
      await expect(readReceipt()).resolves.toMatchObject({
        status: SnoozedThreadStatus.PREPARING,
        archiveClaimedAt: retryAt,
        restoreMessageIds: ["first", "newly-inbox"],
        ...folders,
      });
      const targetOutcomes = [
        {
          key: { accountId: emailAccountId, messageId: "first" },
          outcome: "applied" as const,
          code: null,
        },
        {
          key: { accountId: emailAccountId, messageId: "newly-inbox" },
          outcome: "rejected" as const,
          code: "not_found",
        },
      ];
      const pendingWrite = {
        id: snoozedThread.id,
        claim: retryAt,
        previousMessageId: null,
        messageId: "first",
      };
      await expect(updateSnoozeArchiveWrite(pendingWrite)).resolves.toBe(true);
      const settlement = {
        ...pendingWrite,
        previousMessageId: "first",
        messageId: null,
      };
      await expect(
        updateSnoozeArchiveWrite({ ...settlement, claim: now }),
      ).resolves.toBe(false);
      await expect(
        activatePreparedSnoozedThread(input, retryAt, targetOutcomes),
      ).resolves.toBeNull();
      await expect(updateSnoozeArchiveWrite(settlement)).resolves.toBe(true);
      await activatePreparedSnoozedThread(input, retryAt, targetOutcomes);
      await expect(readReceipt()).resolves.toMatchObject({
        status: SnoozedThreadStatus.PENDING,
        archiveClaimedAt: null,
        targetOutcomes,
      });
    });

    test("serializes mailbox snooze mutations until the owner finishes", async () => {
      const claimed = Promise.withResolvers<void>();
      const finish = Promise.withResolvers<void>();
      const first = withSnoozeMutationLease(emailAccountId, async () => {
        claimed.resolve();
        await finish.promise;
        return "restored";
      });
      await claimed.promise;
      try {
        await expect(
          withSnoozeMutationLease(emailAccountId, async () => "competing"),
        ).resolves.toBeNull();
      } finally {
        finish.resolve();
        await expect(first).resolves.toBe("restored");
      }
      await expect(
        withSnoozeMutationLease(emailAccountId, async () => "next"),
      ).resolves.toBe("next");
    });

    test("allows only one pending or executing restore per thread", async () => {
      const active = await prisma.snoozedThread.create({
        data: {
          emailAccountId,
          scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
          threadId: "active-thread",
        },
      });

      await expect(
        prisma.snoozedThread.create({
          data: {
            emailAccountId,
            scheduledFor: new Date("2026-08-17T10:00:00.000Z"),
            threadId: "active-thread",
          },
        }),
      ).rejects.toThrow();

      await prisma.snoozedThread.update({
        where: { id: active.id },
        data: { status: SnoozedThreadStatus.EXECUTING },
      });
      await expect(
        prisma.snoozedThread.create({
          data: {
            emailAccountId,
            scheduledFor: new Date("2026-08-17T10:00:00.000Z"),
            threadId: "active-thread",
          },
        }),
      ).rejects.toThrow();

      await prisma.snoozedThread.update({
        where: { id: active.id },
        data: { status: SnoozedThreadStatus.COMPLETED },
      });
      await expect(
        prisma.snoozedThread.create({
          data: {
            emailAccountId,
            scheduledFor: new Date("2026-08-17T10:00:00.000Z"),
            threadId: "active-thread",
          },
        }),
      ).resolves.toMatchObject({ status: SnoozedThreadStatus.PENDING });
    });

    test("replaces a legacy pending snooze without a mutation ID", async () => {
      const threadId = "legacy-thread";
      const legacy = await prisma.snoozedThread.create({
        data: {
          emailAccountId,
          scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
          threadId,
        },
      });
      const scheduledFor = new Date("2026-08-17T10:00:00.000Z");
      const input = {
        clientMutationId: "replacement",
        emailAccountId,
        scheduledFor,
        threadId,
      };
      const { snoozedThread } = await prepareSnoozedThread(input);
      const claim = await claimSnoozePreparation(snoozedThread);
      if (!claim) throw new Error("The preparation was unexpectedly claimed");
      await activatePreparedSnoozedThread(input, claim, []);

      await expect(
        prisma.snoozedThread.findUnique({ where: { id: legacy.id } }),
      ).resolves.toMatchObject({ status: SnoozedThreadStatus.CANCELLED });
      await expect(
        prisma.snoozedThread.findUnique({
          where: {
            emailAccountId_clientMutationId: {
              emailAccountId,
              clientMutationId: "replacement",
            },
          },
        }),
      ).resolves.toMatchObject({ status: SnoozedThreadStatus.PENDING });
    });

    test("does not claim a deferred retry before it is due", async () => {
      const scheduledFor = new Date("2026-08-17T09:05:00.000Z");
      const snoozedThread = await prisma.snoozedThread.create({
        data: {
          emailAccountId,
          scheduledFor,
          threadId: "deferred-retry-thread",
        },
      });

      await expect(
        markSnoozedThreadAsExecuting(
          snoozedThread.id,
          new Date("2026-08-17T09:00:00.000Z"),
        ),
      ).resolves.toBeNull();
      await expect(
        markSnoozedThreadAsExecuting(snoozedThread.id, scheduledFor),
      ).resolves.toEqual(scheduledFor);
    });

    test("rolls back cancellation when replacement creation conflicts", async () => {
      const pending = await prisma.snoozedThread.create({
        data: {
          id: "pending-before-conflict",
          emailAccountId,
          scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
          threadId: "rollback-thread",
        },
      });
      await prisma.snoozedThread.create({
        data: {
          id: "duplicate-id",
          emailAccountId,
          scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
          status: SnoozedThreadStatus.COMPLETED,
          threadId: "historical-thread",
        },
      });

      await expect(
        prisma.$transaction([
          prisma.snoozedThread.updateMany({
            where: {
              emailAccountId,
              threadId: "rollback-thread",
              status: SnoozedThreadStatus.PENDING,
            },
            data: { status: SnoozedThreadStatus.CANCELLED },
          }),
          prisma.snoozedThread.create({
            data: {
              id: "duplicate-id",
              emailAccountId,
              scheduledFor: new Date("2026-08-17T10:00:00.000Z"),
              threadId: "rollback-thread",
            },
          }),
        ]),
      ).rejects.toThrow();

      await expect(
        prisma.snoozedThread.findUniqueOrThrow({ where: { id: pending.id } }),
      ).resolves.toMatchObject({ status: SnoozedThreadStatus.PENDING });
    });
  },
);

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
