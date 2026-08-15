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
    let markSnoozedThreadAsExecuting: typeof import("@/utils/snooze/scheduler").markSnoozedThreadAsExecuting;
    let scheduleSnoozedThread: typeof import("@/utils/snooze/scheduler").scheduleSnoozedThread;
    let emailAccountId: string;

    const accountEmail = "snoozed-thread-scheduler-test@example.com";

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      ({ markSnoozedThreadAsExecuting, scheduleSnoozedThread } = await import(
        "@/utils/snooze/scheduler"
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

    test("keeps one active restore when the same thread is scheduled concurrently", async () => {
      const scheduledFor = new Date("2026-08-17T09:00:00.000Z");

      const results = await Promise.allSettled([
        scheduleSnoozedThread({
          emailAccountId,
          scheduledFor,
          threadId: "concurrent-thread",
        }),
        scheduleSnoozedThread({
          emailAccountId,
          scheduledFor,
          threadId: "concurrent-thread",
        }),
      ]);

      expect(results.some((result) => result.status === "fulfilled")).toBe(
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
