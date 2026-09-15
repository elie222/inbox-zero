import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { recordStripeTrialConversion } from "@/app/api/stripe/webhook/trial-conversion";

vi.mock("@/ee/billing/stripe", () => ({ getStripe: vi.fn() }));

const premiumId = "premium-trial-conversion-test";
const convertedAt = new Date("2026-01-01T00:00:00Z");

describe.skipIf(!process.env.RUN_DB_TESTS)(
  "Stripe trial conversion claims",
  () => {
    beforeEach(async () => {
      await prisma.premium.deleteMany({ where: { id: premiumId } });
      await prisma.premium.create({
        data: { id: premiumId, stripeSubscriptionId: "sub_test" },
      });
    });

    afterAll(async () => {
      await prisma.premium.deleteMany({ where: { id: premiumId } });
    });

    it("allows one invoice to win concurrent claims and retry without replacing conversion history", async () => {
      const record = (invoiceId: string) =>
        recordStripeTrialConversion({
          premiumId,
          subscriptionId: "sub_test",
          invoiceId,
          convertedAt,
        });
      const results = await Promise.all([
        record("in_first"),
        record("in_second"),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      const premium = await prisma.premium.findUniqueOrThrow({
        where: { id: premiumId },
      });
      expect(premium.stripeTrialConvertedAt).toEqual(convertedAt);
      const winner = premium.stripeTrialConversionInvoiceId!;
      expect(await record(winner)).toBe(true);
      expect(
        await record(winner === "in_first" ? "in_second" : "in_first"),
      ).toBe(false);
    });

    it("rejects an event for a superseded subscription and preserves legacy conversion history", async () => {
      expect(
        await recordStripeTrialConversion({
          premiumId,
          subscriptionId: "sub_old",
          invoiceId: "in_test",
          convertedAt,
        }),
      ).toBe(false);
      await prisma.premium.update({
        where: { id: premiumId },
        data: { stripeTrialConvertedAt: convertedAt },
      });
      expect(
        await recordStripeTrialConversion({
          premiumId,
          subscriptionId: "sub_test",
          invoiceId: "in_test",
          convertedAt,
        }),
      ).toBe(false);
    });
  },
);
