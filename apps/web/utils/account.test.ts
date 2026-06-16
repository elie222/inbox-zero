import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  cookies: vi.fn(),
  findFirst: vi.fn(),
  flushLoggerSafely: vi.fn(),
  after: vi.fn(),
  env: {
    NODE_ENV: "test",
    AXIOM_TOKEN: undefined,
    NEXT_PUBLIC_LOG_SCOPES: undefined,
    ENABLE_DEBUG_LOGS: false,
  },
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

vi.mock("@/utils/auth", () => ({
  auth: () => mocks.auth(),
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookies(),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock("next/server", () => ({
  after: (callback: () => void | Promise<void>) => mocks.after(callback),
}));

vi.mock("@/env", () => ({
  env: mocks.env,
}));

vi.mock("@/utils/logger-flush", () => ({
  flushLoggerSafely: (...args: unknown[]) => mocks.flushLoggerSafely(...args),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findFirst: (...args: Parameters<typeof mocks.findFirst>) =>
        mocks.findFirst(...args),
    },
  },
}));

import { redirectToEmailAccountPath } from "./account";

describe("redirectToEmailAccountPath", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.auth.mockResolvedValue({ user: { id: "user_123" } });
    mocks.cookies.mockResolvedValue({ get: () => undefined });
  });

  it("sends authenticated users without an email account to mailbox connection", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(redirectToEmailAccountPath("/setup")).rejects.toThrow(
      "redirect:/connect-mailbox?next=%2Fsetup",
    );

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { userId: "user_123" },
      select: { id: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(getAccountRedirectLog(consoleLogSpy)).toEqual(
      expect.objectContaining({
        path: "/setup",
        outcome: "connect-mailbox",
        usedLastEmailAccountCookie: false,
        usedFallbackAccountLookup: true,
        foundEmailAccount: false,
        durationMs: expect.any(Number),
        stepDurationsMs: expect.objectContaining({
          auth: expect.any(Number),
          "last-email-account-cookie": expect.any(Number),
          "fallback-email-account-lookup": expect.any(Number),
        }),
      }),
    );
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/connect-mailbox?next=%2Fsetup",
    );
  });

  it("preserves search params when sending users to mailbox connection", async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(
      redirectToEmailAccountPath("/setup", {
        source: "checkout",
        step: ["one", "two"],
      }),
    ).rejects.toThrow(
      "redirect:/connect-mailbox?next=%2Fsetup%3Fsource%3Dcheckout%26step%3Done%26step%3Dtwo",
    );

    expect(mocks.redirect).toHaveBeenCalledWith(
      "/connect-mailbox?next=%2Fsetup%3Fsource%3Dcheckout%26step%3Done%26step%3Dtwo",
    );
    expect(getAccountRedirectLog(consoleLogSpy)).toEqual(
      expect.objectContaining({
        searchParamKeys: ["source", "step"],
      }),
    );
  });

  it("uses the last email account cookie without querying for an account", async () => {
    mocks.cookies.mockResolvedValue({
      get: () => ({
        value: JSON.stringify({
          userId: "user_123",
          emailAccountId: "account_123",
        }),
      }),
    });

    await expect(redirectToEmailAccountPath("/setup")).rejects.toThrow(
      "redirect:/account_123/setup",
    );

    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(getAccountRedirectLog(consoleLogSpy)).toEqual(
      expect.objectContaining({
        path: "/setup",
        outcome: "account-path",
        usedLastEmailAccountCookie: true,
        usedFallbackAccountLookup: false,
        foundEmailAccount: true,
        stepDurationsMs: expect.not.objectContaining({
          "fallback-email-account-lookup": expect.any(Number),
        }),
      }),
    );
  });
});

function getAccountRedirectLog(consoleLogSpy: ReturnType<typeof vi.spyOn>) {
  const logCall = [...consoleLogSpy.mock.calls]
    .reverse()
    .find(
      ([message]) =>
        typeof message === "string" &&
        message.includes("[account-redirect]: Resolved account redirect"),
    );

  expect(logCall).toBeDefined();

  const message = logCall?.[0];
  expect(typeof message).toBe("string");

  const jsonStart = (message as string).indexOf("{");
  expect(jsonStart).toBeGreaterThanOrEqual(0);

  return JSON.parse((message as string).slice(jsonStart));
}
