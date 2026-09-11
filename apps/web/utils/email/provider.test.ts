import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmailProvider } from "@/utils/email/provider";
import { flushLoggerSafely } from "@/utils/logger-flush";
import { getGmailClientForEmail } from "@/utils/email-account-client";
import { assertProviderNotRateLimited } from "@/utils/email/rate-limit";
import { recordEmailAccountProviderIssue } from "@/utils/email/provider-health";

const { gmailGetMessageMock, gmailSearchMessagesMock, providerToken } =
  vi.hoisted(() => ({
    providerToken: { value: "access-token", error: null as Error | null },
    gmailGetMessageMock: vi.fn(),
    gmailSearchMessagesMock: vi.fn(),
  }));

vi.mock("@/utils/email-account-client", () => ({
  getGmailClientForEmail: vi.fn(),
  getOutlookClientForEmail: vi.fn(),
}));

vi.mock("@/utils/email/rate-limit", () => ({
  assertProviderNotRateLimited: vi.fn(),
}));

vi.mock("@/utils/logger-flush", () => ({
  flushLoggerSafely: vi.fn(),
}));

vi.mock("@/utils/email/provider-health", () => ({
  recordEmailAccountProviderIssue: vi.fn(),
}));

vi.mock("@/utils/email/google", () => ({
  GmailProvider: class {
    readonly name = "google";

    getAccessToken() {
      if (providerToken.error) throw providerToken.error;
      return providerToken.value;
    }

    searchMessages(...args: unknown[]) {
      return gmailSearchMessagesMock(...args);
    }

    getMessage(...args: unknown[]) {
      return gmailGetMessageMock(...args);
    }
  },
}));

vi.mock("@/utils/email/microsoft", () => ({
  OutlookProvider: class {
    readonly name = "microsoft";
  },
}));

describe("createEmailProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerToken.value = "access-token";
    providerToken.error = null;
    vi.mocked(assertProviderNotRateLimited).mockResolvedValue(undefined);
    vi.mocked(getGmailClientForEmail).mockResolvedValue({} as any);
    vi.mocked(flushLoggerSafely).mockResolvedValue(undefined);
    vi.mocked(recordEmailAccountProviderIssue).mockResolvedValue(undefined);
    gmailGetMessageMock.mockResolvedValue({});
    gmailSearchMessagesMock.mockResolvedValue({ messages: [] });
  });

  it("allows provider requests to proceed when a cached access token is unavailable", async () => {
    const logger = createMockLogger();
    const provider = await createEmailProvider({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });
    providerToken.error = new Error("No access token");
    await expect(
      provider.searchMessages({ query: "in:inbox" }),
    ).resolves.toEqual({ messages: [] });
    expect(gmailSearchMessagesMock).toHaveBeenCalledOnce();
  });

  it("records the token used before an operation even if the client token changes", async () => {
    const logger = createMockLogger();
    gmailSearchMessagesMock.mockImplementationOnce(async () => {
      providerToken.value = "new-access-token";
      throw new Error("invalid_grant");
    });
    const provider = await createEmailProvider({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });
    await expect(
      provider.searchMessages({ query: "in:inbox" }),
    ).rejects.toThrow("invalid_grant");
    expect(recordEmailAccountProviderIssue).toHaveBeenCalledWith(
      expect.objectContaining({ failedAccessToken: "access-token" }),
    );
  });

  it("logs and flushes provider creation failures", async () => {
    const logger = createMockLogger();
    vi.mocked(getGmailClientForEmail).mockRejectedValueOnce(
      new Error("token refresh failed"),
    );

    await expect(
      createEmailProvider({
        emailAccountId: "email-account-1",
        provider: "google",
        logger,
      }),
    ).rejects.toThrow("token refresh failed");

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to create email provider",
      expect.objectContaining({
        provider: "google",
        source: "create-email-provider",
        error: expect.any(Error),
      }),
    );
    expect(flushLoggerSafely).toHaveBeenCalledWith(
      logger,
      expect.objectContaining({
        action: "createEmailProvider",
        flushReason: "provider-create-error",
        provider: "google",
      }),
    );
    expect(recordEmailAccountProviderIssue).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "google",
      error: expect.any(Error),
      logger,
      operation: "createEmailProvider",
    });
  });

  it("preserves provider creation failures when flushing logs fails", async () => {
    const logger = createMockLogger();
    vi.mocked(getGmailClientForEmail).mockRejectedValueOnce(
      new Error("token refresh failed"),
    );
    vi.mocked(flushLoggerSafely).mockRejectedValueOnce(
      new Error("flush failed"),
    );

    await expect(
      createEmailProvider({
        emailAccountId: "email-account-1",
        provider: "google",
        logger,
      }),
    ).rejects.toThrow("token refresh failed");

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to flush provider creation failure log",
      expect.objectContaining({
        provider: "google",
        source: "create-email-provider",
        error: expect.any(Error),
      }),
    );
    expect(recordEmailAccountProviderIssue).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "google",
      error: expect.any(Error),
      logger,
      operation: "createEmailProvider",
    });
  });

  it("logs and flushes provider operation failures without changing sync methods", async () => {
    const logger = createMockLogger();
    gmailSearchMessagesMock.mockRejectedValueOnce(
      new Error("provider request failed"),
    );

    const provider = await createEmailProvider({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    expect(provider.getAccessToken()).toBe("access-token");
    await expect(
      provider.searchMessages({ query: "in:inbox" }),
    ).rejects.toThrow("provider request failed");

    expect(logger.warn).toHaveBeenCalledWith(
      "Email provider operation failed",
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
        operation: "searchMessages",
        error: expect.any(Error),
      }),
    );
    expect(flushLoggerSafely).toHaveBeenCalledWith(
      logger,
      expect.objectContaining({
        action: "emailProvider",
        flushReason: "provider-operation-error",
        provider: "google",
        operation: "searchMessages",
      }),
    );
    expect(recordEmailAccountProviderIssue).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "google",
      error: expect.any(Error),
      logger,
      operation: "searchMessages",
      failedAccessToken: "access-token",
    });
  });

  it("preserves async provider operation failures when flushing logs fails", async () => {
    const logger = createMockLogger();
    gmailSearchMessagesMock.mockRejectedValueOnce(
      new Error("provider request failed"),
    );
    vi.mocked(flushLoggerSafely).mockRejectedValueOnce(
      new Error("flush failed"),
    );

    const provider = await createEmailProvider({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await expect(
      provider.searchMessages({ query: "in:inbox" }),
    ).rejects.toThrow("provider request failed");

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to log provider operation failure",
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
        operation: "searchMessages",
        error: expect.any(Error),
      }),
    );
  });

  it("flushes provider operation failures when recording the account issue fails", async () => {
    const logger = createMockLogger();
    gmailSearchMessagesMock.mockRejectedValueOnce(
      new Error("provider request failed"),
    );
    vi.mocked(recordEmailAccountProviderIssue).mockRejectedValueOnce(
      new Error("record failed"),
    );

    const provider = await createEmailProvider({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await expect(
      provider.searchMessages({ query: "in:inbox" }),
    ).rejects.toThrow("provider request failed");

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to record provider issue",
      expect.objectContaining({
        emailAccountId: "email-account-1",
        provider: "google",
        operation: "searchMessages",
        error: expect.any(Error),
      }),
    );
    expect(flushLoggerSafely).toHaveBeenCalledWith(
      logger,
      expect.objectContaining({
        action: "emailProvider",
        flushReason: "provider-operation-error",
        provider: "google",
        operation: "searchMessages",
      }),
    );
  });

  it("logs and flushes sync provider operation failures without changing thrown errors", async () => {
    const logger = createMockLogger();
    gmailGetMessageMock.mockImplementationOnce(() => {
      throw new Error("provider sync failed");
    });

    const provider = await createEmailProvider({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    expect(() => provider.getMessage("message-1")).toThrow(
      "provider sync failed",
    );
    await vi.waitFor(() => {
      expect(flushLoggerSafely).toHaveBeenCalledWith(
        logger,
        expect.objectContaining({
          action: "emailProvider",
          flushReason: "provider-operation-error",
          provider: "google",
          operation: "getMessage",
        }),
      );
    });
  });
});

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    with: vi.fn(),
    flush: vi.fn(),
  } as any;
}
