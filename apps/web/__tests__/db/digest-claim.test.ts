import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { DigestStatus } from "@/generated/prisma/enums";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

describe.skipIf(!RUN_DB_TESTS)(
  "digest claims (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let claimPendingDigestIds: typeof import("@/utils/digest/claim-pending-digests").claimPendingDigestIds;
    let emailAccountId: string;

    const accountEmail = "digest-claim-test@example.com";
    const pendingDigestIds = ["digest-pending-1", "digest-pending-2"];
    const staleProcessingDigestId = "digest-processing-stale";
    const freshProcessingDigestId = "digest-processing-fresh";
    const sentDigestId = "digest-sent";
    const now = new Date("2026-07-30T18:00:00.000Z");

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      ({ claimPendingDigestIds } = await import(
        "@/utils/digest/claim-pending-digests"
      ));
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

      await prisma.digest.createMany({
        data: [
          ...pendingDigestIds.map((id) => ({
            id,
            emailAccountId,
            status: DigestStatus.PENDING,
          })),
          {
            id: staleProcessingDigestId,
            emailAccountId,
            status: DigestStatus.PROCESSING,
            updatedAt: new Date("2026-07-30T17:49:59.000Z"),
          },
          {
            id: freshProcessingDigestId,
            emailAccountId,
            status: DigestStatus.PROCESSING,
            updatedAt: new Date("2026-07-30T17:59:00.000Z"),
          },
          {
            id: sentDigestId,
            emailAccountId,
            status: DigestStatus.SENT,
          },
        ],
      });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
    });

    test("claims pending and stale digests only once across concurrent workers", async () => {
      const [firstClaim, secondClaim] = await Promise.all([
        claimPendingDigestIds({ emailAccountId, now }),
        claimPendingDigestIds({ emailAccountId, now }),
      ]);

      const claimedIds = [...firstClaim, ...secondClaim];

      expect(claimedIds).toHaveLength(3);
      expect(new Set(claimedIds)).toEqual(
        new Set([...pendingDigestIds, staleProcessingDigestId]),
      );
      expect(claimedIds).not.toContain(freshProcessingDigestId);
      expect(claimedIds).not.toContain(sentDigestId);

      const digests = await prisma.digest.findMany({
        where: { emailAccountId },
        select: { id: true, status: true },
      });
      expect(
        digests.filter((digest) => digest.status === DigestStatus.PROCESSING),
      ).toHaveLength(4);
      expect(
        digests.filter((digest) => digest.status === DigestStatus.SENT),
      ).toHaveLength(1);
    });
  },
);
