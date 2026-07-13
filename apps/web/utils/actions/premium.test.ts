import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { updateStripeInvoiceEmailsAction } from "./premium";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

describe("updateStripeInvoiceEmailsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
  });

  it("updates the Stripe invoice email preference for an admin", async () => {
    const result = await updateStripeInvoiceEmailsAction({ enabled: true });

    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      data: { stripeInvoiceEmailsEnabled: true },
    });
    expect(result?.data).toEqual({ enabled: true });
  });

  it("rejects a non-admin user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        id: "premium-1",
        stripeCustomerId: "cus_test",
        admins: [{ id: "another-user" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await updateStripeInvoiceEmailsAction({ enabled: true });

    expect(result?.serverError).toBe("Not admin");
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });
});
