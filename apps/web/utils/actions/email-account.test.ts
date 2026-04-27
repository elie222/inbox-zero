import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { updateEmailAccountRoleAction } from "./email-account";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();

  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => callback()),
  };
});
vi.mock("@sentry/nextjs", () => ({
  setTag: vi.fn(),
  setUser: vi.fn(),
  captureException: vi.fn(),
  withServerActionInstrumentation: vi.fn(
    async (_name: string, callback: () => Promise<unknown>) => callback(),
  ),
}));

const { updateContactRoleMock } = vi.hoisted(() => ({
  updateContactRoleMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@inboxzero/loops", async (importActual) => {
  const actual = await importActual<typeof import("@inboxzero/loops")>();

  return {
    ...actual,
    updateContactRole: updateContactRoleMock,
  };
});

describe("updateEmailAccountRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Promise<unknown>[]),
    );
    prisma.emailAccount.update.mockResolvedValue({
      id: "email-account-1",
    } as any);
    prisma.user.update.mockResolvedValue({ id: "user-1" } as any);
  });

  it("updates the email account role and stores the onboarding answer in one action", async () => {
    const result = await updateEmailAccountRoleAction("email-account-1", {
      role: "Founder",
    });

    expect(result?.serverError).toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-1" },
      data: { role: "Founder" },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        onboardingAnswers: { answers: { role: "Founder" } },
        surveyRole: "Founder",
      },
    });
    expect(updateContactRoleMock).toHaveBeenCalledWith({
      email: "user@example.com",
      role: "Founder",
    });
  });

  it("does not schedule the Loops role update when the DB transaction fails", async () => {
    prisma.$transaction.mockRejectedValue(new Error("db down"));

    const result = await updateEmailAccountRoleAction("email-account-1", {
      role: "Founder",
    });

    expect(result?.serverError).toBeDefined();
    expect(updateContactRoleMock).not.toHaveBeenCalled();
  });
});
