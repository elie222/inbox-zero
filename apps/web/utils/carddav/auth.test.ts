import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  authenticateCarddavRequest,
  hashCarddavPassword,
} from "@/utils/carddav/auth";

vi.mock("@/utils/prisma");

const basic = (email: string, password: string) =>
  `Basic ${Buffer.from(`${email}:${password}`).toString("base64")}`;

const account = {
  id: "acc_1",
  email: "chris@nucar.com",
  carddavPasswordHash: hashCarddavPassword("correct-password"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authenticateCarddavRequest", () => {
  it("authenticates the right password", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(account);

    const result = await authenticateCarddavRequest(
      basic("chris@nucar.com", "correct-password"),
    );

    expect(result).toEqual({
      ok: true,
      emailAccountId: "acc_1",
      email: "chris@nucar.com",
    });
  });

  it("treats the username case-insensitively", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(account);

    const result = await authenticateCarddavRequest(
      basic("Chris@Nucar.com", "correct-password"),
    );

    expect(result.ok).toBe(true);
    expect(prisma.emailAccount.findFirst.mock.calls[0][0].where.email).toBe(
      "chris@nucar.com",
    );
  });

  // The reason a device gets rejected right after a password reset — the
  // case the logs need to name so it doesn't read as a server bug
  it("reports wrong-password for a stale password", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(account);

    const result = await authenticateCarddavRequest(
      basic("chris@nucar.com", "the-old-password"),
    );

    expect(result).toEqual({ ok: false, reason: "wrong-password" });
  });

  it("reports no-credentials for the unauthenticated handshake leg", async () => {
    expect(await authenticateCarddavRequest(null)).toEqual({
      ok: false,
      reason: "no-credentials",
    });
    expect(await authenticateCarddavRequest("Bearer abc")).toEqual({
      ok: false,
      reason: "no-credentials",
    });
  });

  it("reports malformed-header when the payload has no separator", async () => {
    const header = `Basic ${Buffer.from("no-colon-here").toString("base64")}`;
    expect(await authenticateCarddavRequest(header)).toEqual({
      ok: false,
      reason: "malformed-header",
    });
  });

  it("reports unknown-user when no account has CardDAV enabled", async () => {
    prisma.emailAccount.findFirst.mockResolvedValue(null);

    const result = await authenticateCarddavRequest(
      basic("nobody@nucar.com", "whatever"),
    );

    expect(result).toEqual({ ok: false, reason: "unknown-user" });
  });
});
