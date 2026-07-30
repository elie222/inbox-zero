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
          { emailAccountId, status: DigestStatus.PENDING },
          { emailAccountId, status: DigestStatus.PENDING },
          { emailAccountId, status: DigestStatus.SENT },
        ],
      });
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: accountEmail } });
      await prisma.$disconnect();
    });

    test("allows only one concurrent worker to claim each pending digest", async () => {
      const [firstClaim, secondClaim] = await Promise.all([
        claimPendingDigestIds({ emailAccountId }),
        claimPendingDigestIds({ emailAccountId }),
      ]);

      const claimedIds = [...firstClaim, ...secondClaim];

      expect(claimedIds).toHaveLength(2);
      expect(new Set(claimedIds).size).toBe(2);

      const digests = await prisma.digest.findMany({
        where: { emailAccountId },
        select: { id: true, status: true },
      });
      expect(
        digests.filter((digest) => digest.status === DigestStatus.PROCESSING),
      ).toHaveLength(2);
      expect(
        digests.filter((digest) => digest.status === DigestStatus.SENT),
      ).toHaveLength(1);
    });
  },
);
