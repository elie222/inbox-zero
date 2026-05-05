import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  updateAiSensitiveContentPolicyAction,
  updateAiSettingsAction,
} from "./settings";
import { Provider } from "@/utils/llms/config";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { clearSpecificErrorMessagesMock, mockEnv } = vi.hoisted(() => ({
  clearSpecificErrorMessagesMock: vi.fn(),
  mockEnv: {
    AZURE_RESOURCE_NAME: "azure-resource",
    EMAIL_ENCRYPT_SECRET: "test-email-secret",
    EMAIL_ENCRYPT_SALT: "test-email-salt",
    AI_SENSITIVE_CONTENT_POLICY_LOCKED: false,
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/error-messages", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error-messages")>();

  return {
    ...actual,
    clearSpecificErrorMessages: clearSpecificErrorMessagesMock,
  };
});

describe("updateAiSettingsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      aiProvider: Provider.OPEN_AI,
      aiApiKey: "stored-api-key",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    prisma.user.updateMany.mockResolvedValue({ count: 1 } as never);
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_LOCKED = false;
  });

  it("keeps the stored API key when the provider is unchanged and the form leaves it blank", async () => {
    await updateAiSettingsAction({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.1",
      aiApiKey: undefined,
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        aiProvider: Provider.OPEN_AI,
        aiModel: "gpt-5.1",
        aiApiKey: "stored-api-key",
      },
    });
    expect(clearSpecificErrorMessagesMock).toHaveBeenCalled();
  });

  it("requires a new API key when switching providers", async () => {
    const result = await updateAiSettingsAction({
      aiProvider: Provider.ANTHROPIC,
      aiModel: "claude-sonnet-4-5",
      aiApiKey: undefined,
    });

    expect(result?.serverError).toBe(
      "You must provide an API key for this provider",
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateAiSensitiveContentPolicyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_LOCKED = false;
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
  });

  it("saves the account-level policy when deployment policy is editable", async () => {
    await updateAiSensitiveContentPolicyAction("email-account-1", {
      aiSensitiveContentPolicy: "REDACT",
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-1" },
      data: { aiSensitiveContentPolicy: "REDACT" },
    });
  });

  it("rejects account-level policy updates when deployment policy is locked", async () => {
    mockEnv.AI_SENSITIVE_CONTENT_POLICY_LOCKED = true;

    const result = await updateAiSensitiveContentPolicyAction(
      "email-account-1",
      {
        aiSensitiveContentPolicy: "BLOCK",
      },
    );

    expect(result?.serverError).toBe(
      "Sensitive AI content policy is managed by the deployment.",
    );
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });
});
