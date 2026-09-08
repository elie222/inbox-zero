import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { makeSignature } from "better-auth/crypto";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { memoryAdapter } from "better-auth/adapters/memory";
import { deliverTransactionalEmail } from "@inboxzero/transactional-email/src/delivery";
import {
  emailOtpBeforeHook,
  emailOtpAfterHook,
  emailOtpPlugin,
  emailOtpSessionCreationHook,
} from "@/utils/auth/email-otp";
import prisma from "@/utils/__mocks__/prisma";

const { pending } = vi.hoisted(() => ({
  pending: [] as (() => Promise<void>)[],
}));
vi.mock("@/utils/prisma");
vi.mock("next/server", () => ({
  after: (work: () => Promise<void>) => pending.push(work),
}));
vi.mock("@inboxzero/transactional-email/src/delivery", () => ({
  deliverTransactionalEmail: vi.fn().mockResolvedValue({ messageId: "sent" }),
}));

const email = "owner@example.com";

describe("email code authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pending.length = 0;
    prisma.user.findUnique.mockResolvedValue({
      emailOtpEnabled: true,
    } as never);
    prisma.session.findFirst.mockResolvedValue({ id: "active" } as never);
  });

  it("signs into the existing account with a single-use encrypted code", async () => {
    const { database, request } = setup();
    expect(
      (
        await request("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    await flushEmails();
    const code = sentCode();
    expect(JSON.stringify(database.verification)).not.toContain(code);
    const response = await request("/sign-in/email-otp", {
      email,
      otp: code,
      emailOtp: false,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).user.id).toBe("owner");
    expect(database.user).toHaveLength(1);
    expect(
      (await request("/sign-in/email-otp", { email, otp: code })).status,
    ).toBe(400);
    expect(database.session[0].emailOtp).toBe(true);
  });

  it.each([
    false,
    undefined,
  ])("does not send or accept codes when access is %s", async (enabled) => {
    prisma.user.findUnique.mockResolvedValue(
      enabled === undefined ? null : ({ emailOtpEnabled: false } as never),
    );
    const { request } = setup();
    expect(
      (
        await request("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    await flushEmails();
    expect(deliverTransactionalEmail).not.toHaveBeenCalled();
    expect(
      (await request("/sign-in/email-otp", { email, otp: "123456" })).status,
    ).toBe(400);
  });

  it("rejects an outstanding code after the owner disables access", async () => {
    const { request } = setup();
    await request("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    await flushEmails();
    prisma.user.findUnique.mockResolvedValue({
      emailOtpEnabled: false,
    } as never);
    expect(
      (await request("/sign-in/email-otp", { email, otp: sentCode() })).status,
    ).toBe(400);
  });

  it("does not mint a session if access is disabled during verification", async () => {
    const { request, database } = setup();
    await request("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    await flushEmails();
    prisma.user.findUnique
      .mockResolvedValueOnce({ emailOtpEnabled: true } as never)
      .mockResolvedValueOnce({ emailOtpEnabled: false } as never);
    expect(
      (await request("/sign-in/email-otp", { email, otp: sentCode() })).status,
    ).toBe(400);
    expect(database.session).toHaveLength(0);
  });

  it("silently throttles repeated delivery requests for the same address", async () => {
    const { request } = setup();
    prisma.verificationToken.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    expect(
      (
        await request("/email-otp/send-verification-otp", {
          email,
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    await flushEmails();
    expect(deliverTransactionalEmail).not.toHaveBeenCalled();
  });

  it("rejects expired codes", async () => {
    const { request, database } = setup();
    await request("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    await flushEmails();
    database.verification[0].expiresAt = new Date(0);
    expect(
      (await request("/sign-in/email-otp", { email, otp: sentCode() })).status,
    ).toBe(400);
  });

  it("exhausts a code after repeated incorrect attempts", async () => {
    const { request } = setup();
    await request("/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    await flushEmails();
    const code = sentCode();
    const incorrect = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      await request("/sign-in/email-otp", { email, otp: incorrect });
    expect(
      (await request("/sign-in/email-otp", { email, otp: code })).status,
    ).not.toBe(200);
  });

  it.each([
    "/email-otp/verify-email",
    "/email-otp/reset-password",
    "/email-otp/check-verification-otp",
    "/forget-password/email-otp",
  ])("does not expose unrelated plugin endpoint %s", async (path) => {
    const { request } = setup();
    expect(
      (await request(path, { email, otp: "123456", password: "password" }))
        .status,
    ).toBe(400);
  });

  it("blocks provider credential access and revoked cached OTP sessions", async () => {
    const { auth } = setup();
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession(
      "owner",
      false,
      { emailOtp: true },
      true,
    );
    if (!session) throw new Error("No session");
    const cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, context.secret)}`)}`;
    const get = (path: string) =>
      auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          headers: { cookie },
        }),
      );
    const valid = await get("/get-session");
    expect(valid.status).toBe(200);
    expect((await valid.json()).session.emailOtp).toBe(true);
    expect(
      (
        await auth.handler(
          new Request("http://localhost:3000/api/auth/get-access-token", {
            method: "POST",
            headers: {
              cookie,
              "Content-Type": "application/json",
              origin: "http://localhost:3000",
            },
            body: JSON.stringify({ providerId: "google" }),
          }),
        )
      ).status,
    ).toBe(403);
    const cachedCookies = valid.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    expect(cachedCookies).toContain("session_data=");
    prisma.session.findFirst.mockResolvedValue(null);
    const revoked = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session", {
        headers: { cookie: `${cookie}; ${cachedCookies}` },
      }),
    );
    expect(revoked.status).toBe(401);
    await expect(
      auth.api.getSession({
        headers: new Headers({ cookie: `${cookie}; ${cachedCookies}` }),
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
    for (const cookieName of ["session_token", "session_data"]) {
      expect(
        revoked.headers
          .getSetCookie()
          .some(
            (cookie) =>
              cookie.includes(`better-auth.${cookieName}=`) &&
              cookie.includes("Max-Age=0"),
          ),
      ).toBe(true);
    }
  });
});

function setup() {
  const database: Record<string, Record<string, unknown>[]> = {
    user: [
      {
        id: "owner",
        email,
        name: "Owner",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    session: [],
    account: [],
    verification: [],
  };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret: "test-secret-with-enough-entropy-for-email-otp",
    database: memoryAdapter(database),
    plugins: [emailOtpPlugin],
    hooks: {
      before: emailOtpBeforeHook,
      after: createAuthMiddleware(async (ctx) => {
        await emailOtpAfterHook(ctx);
      }),
    },
    databaseHooks: {
      session: { create: { before: emailOtpSessionCreationHook } },
    },
    session: {
      additionalFields: {
        emailOtp: { type: "boolean", defaultValue: false, input: false },
      },
      cookieCache: { enabled: true },
    },
    rateLimit: { enabled: false },
  });
  const request = (path: string, body: Record<string, unknown>) =>
    auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify(body),
      }),
    );
  return { auth, database, request };
}

async function flushEmails() {
  for (const work of pending.splice(0)) await work();
}

function sentCode() {
  const message = vi
    .mocked(deliverTransactionalEmail)
    .mock.calls.at(-1)?.[0].text;
  const code = message?.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("No code delivered");
  return code;
}
