import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  updateSensitiveDataPolicyAction,
  updateAiSettingsAction,
} from "./settings";
import { Provider } from "@/utils/llms/config";

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
    NEXT_PUBLIC_AI_MODEL_SETTINGS_DISABLED: false,
    NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED: false,
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
    prisma.member.findFirst.mockResolvedValue(null as never);
    prisma.user.findUnique.mockResolvedValue({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.1",
      aiApiKey: "stored-api-key",
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    prisma.user.updateMany.mockResolvedValue({ count: 1 } as never);
    mockEnv.NEXT_PUBLIC_AI_MODEL_SETTINGS_DISABLED = false;
    mockEnv.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED = false;
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

  it("updates AI settings for every user in the organization", async () => {
    prisma.member.findFirst.mockResolvedValue({ organizationId: "org-1" } as never);
    prisma.member.findMany.mockResolvedValue([
      { emailAccount: { userId: "user-1" } },
      { emailAccount: { userId: "user-2" } },
    ] as never);

    await updateAiSettingsAction({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.4-mini",
      aiApiKey: "team-api-key",
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-1", "user-2"] } },
      data: {
        aiProvider: Provider.OPEN_AI,
        aiModel: "gpt-5.4-mini",
        aiApiKey: "team-api-key",
      },
    });
    expect(clearSpecificErrorMessagesMock).toHaveBeenCalledTimes(2);
  });

  it("reuses the organization's stored API key when a teammate saves without re-entering it", async () => {
    prisma.member.findFirst.mockResolvedValue({ organizationId: "org-1" } as never);
    prisma.user.findUnique.mockResolvedValue({
      aiProvider: null,
      aiModel: null,
      aiApiKey: null,
    } as Awaited<ReturnType<typeof prisma.user.findUnique>>);
    prisma.user.findFirst.mockResolvedValue({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.1",
      aiApiKey: "org-api-key",
    } as never);
    prisma.member.findMany.mockResolvedValue([
      { emailAccount: { userId: "user-1" } },
      { emailAccount: { userId: "user-2" } },
    ] as never);

    await updateAiSettingsAction({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.4-mini",
      aiApiKey: undefined,
    });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["user-1", "user-2"] } },
      data: {
        aiProvider: Provider.OPEN_AI,
        aiModel: "gpt-5.4-mini",
        aiApiKey: "org-api-key",
      },
    });
  });

  it("rejects account-level AI model updates when deployment settings are disabled", async () => {
    mockEnv.NEXT_PUBLIC_AI_MODEL_SETTINGS_DISABLED = true;

    const result = await updateAiSettingsAction({
      aiProvider: Provider.OPEN_AI,
      aiModel: "gpt-5.1",
      aiApiKey: "new-api-key",
    });

    expect(result?.serverError).toBe(
      "AI model settings are managed by the deployment.",
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("updateSensitiveDataPolicyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED = false;
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as Awaited<ReturnType<typeof prisma.emailAccount.findUnique>>);
  });

  it("saves the account-level policy when deployment policy is editable", async () => {
    await updateSensitiveDataPolicyAction("email-account-1", {
      sensitiveDataPolicy: "REDACT",
    });

    expect(prisma.emailAccount.update).toHaveBeenCalledWith({
      where: { id: "email-account-1" },
      data: { sensitiveDataPolicy: "REDACT" },
    });
  });

  it("rejects account-level policy updates when deployment policy is locked", async () => {
    mockEnv.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED = true;

    const result = await updateSensitiveDataPolicyAction("email-account-1", {
      sensitiveDataPolicy: "BLOCK",
    });

    expect(result?.serverError).toBe(
      "Sensitive data protection is managed by the deployment.",
    );
    expect(prisma.emailAccount.update).not.toHaveBeenCalled();
  });
});
