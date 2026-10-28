import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

// The onboarding steps that create the "To Reply" rule can race each other.
// The loser hits the (name, emailAccountId) unique index and must be
// recognized as a duplicate so the caller can fall back to the winner's row.
describe.skipIf(!RUN_DB_TESTS)(
  "rule name unique violation (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let emailAccountId: string;

    const accountEmail = "rule-name-unique-test@example.com";

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

    test("a second rule with the same name is reported as a duplicate on name", async () => {
      await prisma.rule.create({
        data: {
          name: "To Reply",
          emailAccountId,
          systemType: SystemType.TO_REPLY,
        },
      });

      const error = await prisma.rule
        .create({ data: { name: "To Reply", emailAccountId } })
        .then(
          () => null,
          (thrown: unknown) => thrown,
        );

      expect(error).not.toBeNull();
      expect(isDuplicateError(error, "name")).toBe(true);
    });
  },
);
