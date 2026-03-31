import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { regenerateWebhookSecretAction } from "./webhook";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

describe("regenerateWebhookSecretAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.update.mockResolvedValue({ id: "user-1" } as never);
  });

  it("stores the secret and returns it once to the caller", async () => {
    const result = await regenerateWebhookSecretAction();

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        webhookSecret: expect.stringMatching(/^[A-Za-z0-9]{32}$/),
      },
    });
    expect(result?.data?.webhookSecret).toMatch(/^[A-Za-z0-9]{32}$/);
  });
});
