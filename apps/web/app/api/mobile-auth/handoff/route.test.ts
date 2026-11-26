import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeMobileAuthCode } from "@/utils/mobile-auth/oauth-code";
import { getMobileAuthCodeChallenge } from "@/utils/mobile-auth/pkce";

const { records, prismaMock, authState, redisMock } = vi.hoisted(() => ({
  redisMock: { incr: vi.fn(), expire: vi.fn() },
  records: new Map<
    string,
    { token: string; identifier: string; expires: Date }
  >(),
  prismaMock: {
    verificationToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
  authState: {
    auth: { userId: "user-1" } as { userId: string; emailOtp?: boolean },
  },
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-secret",
    NEXT_PUBLIC_BASE_URL: "https://app.example",
  },
}));
vi.mock("@/utils/prisma", () => ({ default: prismaMock }));
vi.mock("@/utils/redis", () => ({ redis: redisMock }));
vi.mock("@/utils/middleware", async () => {
  const { addTestAuth } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");
  return {
    withAuth:
      (_scope: string, handler: (request: Request) => Promise<Response>) =>
      (request: Request) =>
        handler(addTestAuth(request, { auth: authState.auth })),
  };
});

import { POST } from "./route";

const state = "desktop-handoff-state-1234";
const codeVerifier = "v".repeat(43);
const codeChallenge = getMobileAuthCodeChallenge(codeVerifier);

describe("POST /api/mobile-auth/handoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    records.clear();
    authState.auth = { userId: "user-1" };
    redisMock.incr.mockResolvedValue(1);
    prismaMock.verificationToken.create.mockImplementation(async ({ data }) => {
      records.set(data.token, data);
      return data;
    });
    prismaMock.verificationToken.findUnique.mockImplementation(
      async ({ where }) => records.get(where.token) ?? null,
    );
    prismaMock.verificationToken.deleteMany.mockImplementation(
      async ({ where }) => {
        if (!where.token) return { count: 0 };
        const record = records.get(where.token);
        if (!record || record.identifier !== where.identifier)
          return { count: 0 };
        records.delete(where.token);
        return { count: 1 };
      },
    );
  });

  it("returns a code the companion app redeems for the caller with its verifier", async () => {
    const response = await POST(request({ codeChallenge, state }), {} as never);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { code } = await response.json();

    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier: "w".repeat(43) }),
    ).rejects.toThrow();
    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier }),
    ).resolves.toEqual({ userId: "user-1" });
    await expect(
      consumeMobileAuthCode({ code, state, codeVerifier }),
    ).rejects.toThrow();
  });

  it.each([
    { name: "missing state", body: { codeChallenge } },
    { name: "short state", body: { codeChallenge, state: "short" } },
    {
      name: "malformed challenge",
      body: { codeChallenge: `${codeChallenge}=`, state },
    },
    { name: "missing challenge", body: { state } },
  ])("rejects a $name", async ({ body }) => {
    await expect(POST(request(body), {} as never)).rejects.toThrow();
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("rejects a cross-site simple form post", async () => {
    const response = await POST(
      request({ codeChallenge, state }, "text/plain"),
      {} as never,
    );

    expect(response.status).toBe(415);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it.each([
    "same-site",
    "cross-site",
  ])("rejects a %s browser request", async (fetchSite) => {
    const response = await POST(
      request({ codeChallenge, state }, "application/json", {
        "sec-fetch-site": fetchSite,
      }),
      {} as never,
    );

    expect(response.status).toBe(403);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("stops minting codes once a user hits the handoff limit", async () => {
    redisMock.incr.mockResolvedValue(11);

    const response = await POST(request({ codeChallenge, state }), {} as never);

    expect(response.status).toBe(429);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });

  it("rejects email one-time-code sessions", async () => {
    authState.auth = { userId: "user-1", emailOtp: true };

    const response = await POST(request({ codeChallenge, state }), {} as never);

    expect(response.status).toBe(403);
    expect(prismaMock.verificationToken.create).not.toHaveBeenCalled();
  });
});

function request(
  body: unknown,
  contentType = "application/json",
  headers: Record<string, string> = {},
) {
  return new NextRequest("http://localhost:3000/api/mobile-auth/handoff", {
    method: "POST",
    headers: { "content-type": contentType, ...headers },
    body: JSON.stringify(body),
  });
}
