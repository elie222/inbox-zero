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

  it.each([
    true,
    false,
  ])("sets the Stripe invoice email preference to %s for an admin", async (enabled) => {
    const result = await updateStripeInvoiceEmailsAction({ enabled });

    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: { id: "premium-1" },
      data: { stripeInvoiceEmailsEnabled: enabled },
    });
    expect(result?.data).toEqual({ enabled });
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

  it("rejects a user without a Stripe billing account", async () => {
    prisma.user.findUnique.mockResolvedValue({
      premium: {
        id: "premium-1",
        stripeCustomerId: null,
        admins: [{ id: "user-1" }],
      },
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);

    const result = await updateStripeInvoiceEmailsAction({ enabled: true });

    expect(result?.serverError).toBe("Stripe billing account not found");
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });
});
