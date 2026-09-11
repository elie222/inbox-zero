import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { regenerateWebhookSecretAction } from "./webhook";
import { WEBHOOK_ACTION_DISABLED_MESSAGE } from "@/utils/webhook-action";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    webhookActionsEnabled: true,
  },
}));

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
  },
}));

describe("regenerateWebhookSecretAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
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

  it("returns a server error when webhook actions are disabled", async () => {
    mockEnv.webhookActionsEnabled = false;

    const result = await regenerateWebhookSecretAction();

    expect(result?.serverError).toBe(WEBHOOK_ACTION_DISABLED_MESSAGE);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
