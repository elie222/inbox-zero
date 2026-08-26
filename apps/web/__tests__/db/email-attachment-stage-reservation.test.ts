import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

describe.skipIf(!RUN_DB_TESTS)(
  "email attachment stage reservation (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let emailAccountId: string;

    const accountEmail = "attachment-stage-reservation-test@example.com";
    const now = new Date("2026-08-27T00:00:00.000Z");

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
    });

    beforeEach(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });

      const user = await prisma.user.create({ data: { email: accountEmail } });
      const account = await prisma.account.create({
        data: {
          userId: user.id,
          provider: "google",
          providerAccountId: accountEmail,
          type: "oauth",
        },
      });
      const emailAccount = await prisma.emailAccount.create({
        data: {
          email: accountEmail,
          userId: user.id,
          accountId: account.id,
        },
      });
      emailAccountId = emailAccount.id;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
    });

    test("serializes concurrent reservations against the account quota", async () => {
      const [first, second] = await Promise.all([
        reserve({
          attachmentId: "attachment-1",
          maximumLiveStages: 1,
          mutationId: randomUUID(),
        }),
        reserve({
          attachmentId: "attachment-2",
          maximumLiveStages: 1,
          mutationId: randomUUID(),
        }),
      ]);

      expect([first.outcome, second.outcome].sort()).toEqual([
        "quota_exceeded",
        "reserved",
      ]);
      await expect(
        prisma.emailSendAttachmentStage.count({ where: { emailAccountId } }),
      ).resolves.toBe(1);
    });

    test("returns the same stage for concurrent idempotent reservations", async () => {
      const mutationId = randomUUID();
      const [first, second] = await Promise.all([
        reserve({ attachmentId: "attachment-1", mutationId }),
        reserve({ attachmentId: "attachment-1", mutationId }),
      ]);

      expect(first.outcome).toBe("reserved");
      expect(second.outcome).toBe("reserved");
      expect(first.stageIds).toEqual(second.stageIds);
      await expect(
        prisma.emailSendAttachmentStage.count({ where: { emailAccountId } }),
      ).resolves.toBe(1);
    });

    test("releases a stale pre-provider claim and re-reserves a deleted stage", async () => {
      const mutationId = randomUUID();
      const stage = await createStage({
        attachmentId: "attachment-1",
        mutationId,
        status: "DELETED",
      });
      await createStaleOperation({ mutationId, providerStartedAt: null });

      const result = await reserve({
        attachmentId: stage.attachmentId,
        mutationId,
      });

      expect(result).toMatchObject({
        operationIsTerminal: false,
        outcome: "reserved",
        stageIds: [stage.id],
      });
      await expect(
        prisma.emailSendOperation.findUnique({
          where: {
            emailAccountId_clientMutationId: {
              emailAccountId,
              clientMutationId: mutationId,
            },
          },
        }),
      ).resolves.toBeNull();
      await expect(
        prisma.emailSendAttachmentStage.findUniqueOrThrow({
          where: { id: stage.id },
        }),
      ).resolves.toMatchObject({
        deletedAt: null,
        etag: null,
        id: stage.id,
        status: "PENDING",
      });
      const refreshed = await prisma.emailSendAttachmentStage.findUniqueOrThrow(
        { where: { id: stage.id } },
      );
      expect(refreshed.pathname).not.toBe(stage.pathname);
    });

    test("marks a stale provider-started claim uncertain without resetting its stage", async () => {
      const mutationId = randomUUID();
      const stage = await createStage({
        attachmentId: "attachment-1",
        etag: "provider-etag",
        mutationId,
        status: "DELETED",
      });
      const providerStartedAt = new Date(now.getTime() - 3 * 60 * 1000);
      await createStaleOperation({ mutationId, providerStartedAt });

      const result = await reserve({
        attachmentId: stage.attachmentId,
        mutationId,
      });

      expect(result).toMatchObject({
        operationIsTerminal: true,
        outcome: "reserved",
        stageIds: [stage.id],
      });
      await expect(
        prisma.emailSendOperation.findUniqueOrThrow({
          where: {
            emailAccountId_clientMutationId: {
              emailAccountId,
              clientMutationId: mutationId,
            },
          },
        }),
      ).resolves.toMatchObject({ status: "UNCERTAIN" });
      await expect(
        prisma.emailSendAttachmentStage.findUniqueOrThrow({
          where: { id: stage.id },
        }),
      ).resolves.toMatchObject({
        etag: stage.etag,
        id: stage.id,
        pathname: stage.pathname,
        status: "DELETED",
      });
    });

    test("rejects changed attachment sets and metadata", async () => {
      const mutationId = randomUUID();
      await createStage({ attachmentId: "attachment-1", mutationId });

      await expect(
        reserve({ attachmentId: "attachment-2", mutationId }),
      ).resolves.toMatchObject({ outcome: "attachment_set_changed" });
      await expect(
        reserve({
          attachmentId: "attachment-1",
          filename: "changed.txt",
          mutationId,
        }),
      ).resolves.toMatchObject({ outcome: "metadata_changed" });
    });

    async function reserve({
      attachmentId,
      filename = `${attachmentId}.txt`,
      maximumLiveStages = 100,
      mutationId,
    }: {
      attachmentId: string;
      filename?: string;
      maximumLiveStages?: number;
      mutationId: string;
    }) {
      const attachment = {
        id: attachmentId,
        filename,
        mimeType: "text/plain",
        size: 5,
        disposition: "attachment",
        pathname: `mail-attachments/${randomUUID().replaceAll("-", "")}`,
        stageId: randomUUID().replaceAll("-", ""),
      };
      const [result] = await prisma.$queryRaw<
        {
          reservation: {
            operationIsTerminal?: boolean;
            outcome: string;
            stageIds?: string[];
          };
        }[]
      >`
        SELECT "reserveEmailSendAttachmentStages"(
          ${emailAccountId}::TEXT,
          ${mutationId}::TEXT,
          ${now}::TIMESTAMP(3),
          ${new Date(now.getTime() - 2 * 60 * 1000)}::TIMESTAMP(3),
          ${new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)}::TIMESTAMP(3),
          ${JSON.stringify([attachment])}::JSONB,
          ${maximumLiveStages}::INTEGER,
          ${1024}::BIGINT
        ) AS reservation
      `;
      return result.reservation;
    }

    function createStage({
      attachmentId,
      etag,
      mutationId,
      status = "PENDING",
    }: {
      attachmentId: string;
      etag?: string;
      mutationId: string;
      status?: "DELETED" | "PENDING";
    }) {
      return prisma.emailSendAttachmentStage.create({
        data: {
          attachmentId,
          contentId: null,
          deletedAt: status === "DELETED" ? now : null,
          disposition: "attachment",
          emailAccountId,
          etag,
          expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          filename: `${attachmentId}.txt`,
          mimeType: "text/plain",
          mutationId,
          pathname: `mail-attachments/${randomUUID().replaceAll("-", "")}`,
          size: 5,
          status,
        },
      });
    }

    function createStaleOperation({
      mutationId,
      providerStartedAt,
    }: {
      mutationId: string;
      providerStartedAt: Date | null;
    }) {
      return prisma.emailSendOperation.create({
        data: {
          clientMutationId: mutationId,
          emailAccountId,
          payloadHash: "payload-hash",
          processingStartedAt: new Date(now.getTime() - 3 * 60 * 1000),
          providerStartedAt,
          status: "PROCESSING",
        },
      });
    }
  },
);
