import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTransactionalEmailConfigured } from "@inboxzero/transactional-email/src/delivery";
import { auth } from "@/utils/auth";
import { captureException } from "@/utils/error";
import prisma from "@/utils/__mocks__/prisma";
import { GET } from "./route";

vi.mock("@/utils/auth", () => ({ auth: vi.fn() }));
vi.mock("@/utils/prisma");
vi.mock("@inboxzero/transactional-email/src/delivery", () => ({
  isTransactionalEmailConfigured: vi.fn(),
}));
vi.mock("@/utils/error", async (importActual) => ({
  ...(await importActual<typeof import("@/utils/error")>()),
  captureException: vi.fn(),
}));
vi.mock("@/utils/error.server");

describe("GET /api/user/email-otp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1" },
      session: { emailOtp: false },
    } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(isTransactionalEmailConfigured).mockReturnValue(true);
  });

  it("returns a known 401 when a cached session belongs to a deleted user", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.findUniqueOrThrow.mockRejectedValue(
      new Error("No record was found for a query"),
    );

    const response = await getSettings();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      isKnownError: true,
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests before reading settings", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const response = await getSettings();

    expect(response.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])("preserves settings and management permissions for emailOtp=%s", async (emailOtp) => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1" },
      session: { emailOtp },
    } as Awaited<ReturnType<typeof auth>>);
    prisma.user.findUnique.mockResolvedValue({
      email: "user@example.com",
      emailOtpEnabled: true,
    } as NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>);

    const response = await getSettings();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      email: "user@example.com",
      emailOtpEnabled: true,
      canManage: !emailOtp,
      emailDeliveryConfigured: true,
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user-1" },
      select: { email: true, emailOtpEnabled: true },
    });
  });

  it("keeps unexpected database failures as server errors", async () => {
    prisma.user.findUnique.mockRejectedValue(new Error("Database unavailable"));

    const response = await getSettings();

    expect(response.status).toBe(500);
    expect(captureException).toHaveBeenCalledOnce();
  });
});

function getSettings() {
  return GET(new NextRequest("http://localhost/api/user/email-otp"), {
    params: Promise.resolve({}),
  });
}
