import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { GroupItemType, SystemType } from "@/generated/prisma/enums";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";

const RUN_DB_TESTS = process.env.RUN_DB_TESTS;

// The cold email blocker short-circuits rule matching on a learned pattern, so the
// only thing that matters is which row Postgres ends up holding. A mocked Prisma
// cannot show that, and a second row rather than an updated one silently re-pins
// the sender.
describe.skipIf(!RUN_DB_TESTS)(
  "cold email exclusion after a reply (real database)",
  { timeout: 30_000 },
  () => {
    let prisma: typeof import("@/utils/prisma").default;
    let excludeRepliedSendersFromColdEmail: typeof import("@/utils/cold-email/exclude-replied-sender").excludeRepliedSendersFromColdEmail;
    let isColdEmail: typeof import("@/utils/cold-email/is-cold-email").isColdEmail;

    const logger = createTestLogger();
    const accountEmail = "cold-email-exclude-test@example.com";
    // A different domain to the account, or the internal-sender check answers first.
    const coldSender = "Cold.Sender@ColdCo.test";
    let emailAccountId: string;
    let groupId: string;
    let coldEmailRuleId: string;

    beforeAll(async () => {
      prisma = (await import("@/utils/prisma")).default;
      ({ excludeRepliedSendersFromColdEmail } = await import(
        "@/utils/cold-email/exclude-replied-sender"
      ));
      ({ isColdEmail } = await import("@/utils/cold-email/is-cold-email"));
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
        data: { email: accountEmail, userId: user.id, accountId: account.id },
      });
      emailAccountId = emailAccount.id;

      const rule = await prisma.rule.create({
        data: {
          name: "Cold Email",
          emailAccountId,
          systemType: SystemType.COLD_EMAIL,
          enabled: true,
        },
      });
      coldEmailRuleId = rule.id;

      const group = await prisma.group.create({
        data: {
          name: "Cold Email",
          emailAccountId,
          rule: { connect: { id: rule.id } },
        },
      });
      groupId = group.id;

      await prisma.groupItem.create({
        data: {
          groupId,
          type: GroupItemType.FROM,
          value: coldSender,
          exclude: false,
        },
      });
    });

    test("replying flips the stored pattern instead of adding a second one", async () => {
      await excludeRepliedSendersFromColdEmail({
        emailAccountId,
        // Different casing to the stored pattern, which is how senders arrive.
        message: getMockMessage({ to: coldSender.toLowerCase() }),
        logger,
      });

      const items = await prisma.groupItem.findMany({ where: { groupId } });

      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ value: coldSender, exclude: true });
    });

    test("the sender no longer short-circuits the cold email blocker", async () => {
      await excludeRepliedSendersFromColdEmail({
        emailAccountId,
        message: getMockMessage({ to: coldSender.toLowerCase() }),
        logger,
      });

      const emailAccount = await prisma.emailAccount.findUniqueOrThrow({
        where: { id: emailAccountId },
        include: { user: true },
      });

      const result = await isColdEmail({
        email: {
          id: "message-1",
          threadId: "thread-1",
          from: coldSender,
          to: accountEmail,
          subject: "Quick question",
          content: "Following up on my last note.",
          date: new Date(),
        },
        emailAccount: emailAccount as any,
        provider: {
          hasPreviousCommunicationsWithSenderOrDomain: vi
            .fn()
            .mockResolvedValue(false),
        } as any,
        coldEmailRule: {
          id: coldEmailRuleId,
          instructions: null,
          groupId,
        } as any,
      });

      expect(result).toMatchObject({ isColdEmail: false, reason: "excluded" });
    });
  },
);
