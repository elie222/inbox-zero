import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeMobileAuthState,
  consumeMobileAuthFailureState,
  consumeMobileAuthCode,
  createMobileAuthCode,
  createMobileAuthState,
  completeMobileAuthState,
  storeMobileAuthState,
} from "./oauth-code";
import { getMobileAuthCodeChallenge } from "./pkce";
import { mobileAuthProviderCompletion } from "./provider-completion";

const { records, prismaMock } = vi.hoisted(() => ({
  records: new Map<
    string,
    { token: string; identifier: string; expires: Date }
  >(),
  prismaMock: {
    verificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));
vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-secret",
    NEXT_PUBLIC_BASE_URL: "https://app.example",
  },
}));
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));

const state = "state-1234567890";
const verifier = "a".repeat(43);
const codeChallenge = getMobileAuthCodeChallenge(verifier);
const pending = {
  state,
  codeChallenge,
  provider: "google" as const,
  completionToken: "completion-secret",
  returnUrlMode: "custom-scheme" as const,
};
const completed = {
  state,
  provider: "google",
  completionToken: "completion-secret",
  sessionToken: "fresh-session",
};

beforeEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
  records.clear();
  prismaMock.verificationToken.create.mockImplementation(async ({ data }) => {
    records.set(data.token, data);
    return data;
  });
  prismaMock.verificationToken.findUnique.mockImplementation(
    async ({ where }) => {
      const record = records.get(where.token);
      return record ? { ...record } : null;
    },
  );
  prismaMock.verificationToken.deleteMany.mockImplementation(
    async ({ where }) => {
      if (!where.token) return { count: 0 };
      const record = records.get(where.token);
      if (
        !record ||
        record.identifier !== where.identifier ||
        record.expires <= where.expires.gt
      )
        return { count: 0 };
      records.delete(where.token);
      return { count: 1 };
    },
  );
  prismaMock.verificationToken.updateMany.mockImplementation(
    async ({ where, data }) => {
      const record = records.get(where.token);
      if (
        !record ||
        record.identifier !== where.identifier ||
        record.expires <= where.expires.gt
      )
        return { count: 0 };
      records.set(where.token, { ...record, ...data });
      return { count: 1 };
    },
  );
});

describe("mobile authentication authorization", () => {
  it("consumes only issued, pending states for provider failures", async () => {
    await expect(consumeMobileAuthFailureState({ state })).rejects.toThrow();
    await storeMobileAuthState(pending);
    await expect(consumeMobileAuthFailureState({ state })).resolves.toEqual({
      returnUrlMode: "custom-scheme",
    });
    await expect(consumeMobileAuthFailureState({ state })).rejects.toThrow();
    await storeMobileAuthState(pending);
    await completeMobileAuthState(completed);
    await expect(consumeMobileAuthFailureState({ state })).rejects.toThrow();
    await expect(consumeMobileAuthState(completed)).resolves.toMatchObject({
      codeChallenge,
    });
  });

  it("generates unpredictable states", () => {
    expect(createMobileAuthState()).toHaveLength(43);
    expect(createMobileAuthState()).not.toBe(createMobileAuthState());
  });

  it("rejects states that were never issued", async () => {
    await expect(
      consumeMobileAuthState({ state, sessionToken: "ambient-session" }),
    ).rejects.toThrow("Invalid authentication state");
  });

  it("rejects an issued state before provider completion even with an ambient session", async () => {
    await storeMobileAuthState(pending);
    await expect(
      consumeMobileAuthState({ state, sessionToken: "ambient-session" }),
    ).rejects.toThrow("Invalid authentication state");
  });

  it.each([
    "app-link",
    "custom-scheme",
    "desktop-scheme",
  ] as const)("completes and redeems a %s flow once", async (returnUrlMode) => {
    await storeMobileAuthState({ ...pending, returnUrlMode });
    await completeMobileAuthState(completed);
    const grant = await consumeMobileAuthState({
      state,
      sessionToken: completed.sessionToken,
    });
    expect(grant).toEqual({ returnUrlMode, codeChallenge });
    await expect(
      consumeMobileAuthState({ state, sessionToken: completed.sessionToken }),
    ).rejects.toThrow();
    const code = await createMobileAuthCode({
      state,
      userId: "user-1",
      codeChallenge: grant.codeChallenge,
    });
    expect([...records.values()][0].token).not.toBe(code);
    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier: verifier }),
    ).resolves.toEqual({ userId: "user-1" });
    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier: verifier }),
    ).rejects.toThrow();
  });

  it.each([
    { provider: "microsoft" },
    { completionToken: "other-flow" },
    { state: "unknown-state-123" },
  ])("rejects unrelated provider completion %j", async (override) => {
    await storeMobileAuthState(pending);
    await expect(
      completeMobileAuthState({ ...completed, ...override }),
    ).rejects.toThrow();
    await expect(
      consumeMobileAuthState({ state, sessionToken: completed.sessionToken }),
    ).rejects.toThrow();
  });

  it("cannot use another browser session after completing an attacker initiated flow", async () => {
    await storeMobileAuthState(pending);
    await completeMobileAuthState(completed);
    await expect(
      consumeMobileAuthState({ state, sessionToken: "victim-session" }),
    ).rejects.toThrow();
    await expect(
      consumeMobileAuthState({ state, sessionToken: completed.sessionToken }),
    ).resolves.toMatchObject({ codeChallenge });
  });

  it("does not allow another completion to replace the bound session", async () => {
    await storeMobileAuthState(pending);
    await completeMobileAuthState(completed);
    await expect(
      completeMobileAuthState({
        ...completed,
        sessionToken: "replacement-session",
      }),
    ).rejects.toThrow();
  });

  it("expires pending and completed states", async () => {
    vi.useFakeTimers();
    await storeMobileAuthState(pending);
    vi.advanceTimersByTime(5 * 60 * 1000);
    await expect(completeMobileAuthState(completed)).rejects.toThrow();
    await storeMobileAuthState(pending);
    await completeMobileAuthState(completed);
    vi.advanceTimersByTime(5 * 60 * 1000);
    await expect(
      consumeMobileAuthState({ state, sessionToken: completed.sessionToken }),
    ).rejects.toThrow();
    vi.useRealTimers();
  });

  it("allows only one concurrent completion and one concurrent state consumption", async () => {
    await storeMobileAuthState(pending);
    expect(
      (
        await Promise.allSettled([
          completeMobileAuthState(completed),
          completeMobileAuthState(completed),
        ])
      ).filter((r) => r.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      (
        await Promise.allSettled([
          consumeMobileAuthState(completed),
          consumeMobileAuthState(completed),
        ])
      ).filter((r) => r.status === "fulfilled"),
    ).toHaveLength(1);
  });

  it.each([
    "",
    "short",
    "b".repeat(43),
  ])("rejects intercepted codes without the initiating client's verifier", async (codeVerifier) => {
    const code = await createMobileAuthCode({
      state,
      userId: "user-1",
      codeChallenge,
    });
    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier }),
    ).rejects.toThrow();
    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier: verifier }),
    ).resolves.toEqual({ userId: "user-1" });
  });

  it("rejects a code paired with another state", async () => {
    const code = await createMobileAuthCode({
      state,
      userId: "user-1",
      codeChallenge,
    });
    await expect(
      consumeMobileAuthCode({
        code,
        state: "different-state-123",
        codeVerifier: verifier,
      }),
    ).rejects.toThrow();
  });

  it("rejects expired codes and concurrent replays", async () => {
    vi.useFakeTimers();
    const expired = await createMobileAuthCode({
      state,
      userId: "user-1",
      codeChallenge,
    });
    vi.advanceTimersByTime(5 * 60 * 1000);
    await expect(
      consumeMobileAuthCode({ code: expired, state, codeVerifier: verifier }),
    ).rejects.toThrow();
    const code = await createMobileAuthCode({
      state,
      userId: "user-1",
      codeChallenge,
    });
    const input = { code, state, codeVerifier: verifier };
    expect(
      (
        await Promise.allSettled([
          consumeMobileAuthCode(input),
          consumeMobileAuthCode(input),
        ])
      ).filter((r) => r.status === "fulfilled"),
    ).toHaveLength(1);
    vi.useRealTimers();
  });

  it.each([
    "apple",
    "google",
    "microsoft",
  ] as const)("binds %s callback completion to its newly created session", async (provider) => {
    await storeMobileAuthState({ ...pending, provider });
    await mobileAuthProviderCompletion(
      hookContext({ params: { id: provider } }),
    );
    await expect(consumeMobileAuthState(completed)).resolves.toMatchObject({
      codeChallenge,
    });
  });

  it.each([
    { path: "/sign-in/email-otp" },
    { params: { id: "other" } },
    {
      context: {
        responseHeaders: new Headers({
          location: `https://app.example/api/mobile-auth/callback?state=${state}&completion=wrong`,
        }),
      },
    },
    { context: { newSession: null } },
    {
      context: {
        responseHeaders: new Headers({
          location: `https://other.example/api/mobile-auth/callback?state=${state}`,
        }),
      },
    },
    {
      context: {
        responseHeaders: new Headers({
          location: `https://app.example/api/mobile-auth/callback?state=${state}&error=denied`,
        }),
      },
    },
  ])("does not authorize from unsuccessful or unrelated callbacks %#", async (override) => {
    await storeMobileAuthState(pending);
    await mobileAuthProviderCompletion(hookContext(override)).catch(
      () => undefined,
    );
    await expect(consumeMobileAuthState(completed)).rejects.toThrow();
  });
});

function hookContext(
  override: {
    path?: string;
    params?: object;
    query?: object;
    context?: object;
  } = {},
) {
  return {
    path: "/callback/:id",
    params: { id: "google" },
    query: { state: "completion-secret" },
    ...override,
    context: {
      newSession: {
        session: { token: "fresh-session" },
        user: { id: "user-1" },
      },
      responseHeaders: new Headers({
        location: `https://app.example/api/mobile-auth/callback?state=${state}&completion=completion-secret`,
      }),
      ...override.context,
    },
  } as Parameters<typeof mobileAuthProviderCompletion>[0];
}
