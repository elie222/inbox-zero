import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import type { PublicContactContext } from "@/utils/ai/public-contact-context-schema";

vi.mock("@/env", () => ({
  env: { EMAIL_ENCRYPT_SALT: "test-hmac-salt" },
}));
vi.mock("@/utils/prisma");

import {
  getStoredPublicContactContext,
  storePublicContactContext,
  storePublicContactContextNotFound,
} from "@/utils/ai/public-contact-context-store";

describe("public contact context store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the latest fresh public snapshot", async () => {
    const context = getContext();
    prisma.publicContactSnapshot.findFirst.mockResolvedValue({
      status: "FOUND",
      context,
      refreshAfter: new Date("2026-08-15T12:00:00.000Z"),
    });

    await expect(
      getStoredPublicContactContext("John@Acme.com"),
    ).resolves.toEqual({ status: "found", context });

    expect(prisma.publicContactSnapshot.findFirst).toHaveBeenCalledWith({
      where: {
        identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
      orderBy: [
        { researchStartedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: { status: true, context: true, refreshAfter: true },
    });
    expect(
      prisma.publicContactSnapshot.findFirst.mock.calls[0]?.[0].where
        .identityHash,
    ).not.toContain("john");
  });

  it("keeps stale history but treats the latest snapshot as a cache miss", async () => {
    prisma.publicContactSnapshot.findFirst.mockResolvedValue({
      status: "FOUND",
      context: getContext(),
      refreshAfter: new Date("2026-08-14T11:59:59.999Z"),
    });

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "miss" });

    expect(prisma.publicContactSnapshot.deleteMany).not.toHaveBeenCalled();
  });

  it("returns a fresh not-found snapshot without storing an email", async () => {
    prisma.publicContactSnapshot.findFirst.mockResolvedValue({
      status: "NOT_FOUND",
      context: null,
      refreshAfter: new Date("2026-08-14T13:00:00.000Z"),
    });

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("fails closed when durable storage is unavailable", async () => {
    prisma.publicContactSnapshot.findFirst.mockRejectedValue(
      new Error("Database unavailable"),
    );

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("ignores malformed or unsafe stored snapshots", async () => {
    prisma.publicContactSnapshot.findFirst.mockResolvedValue({
      status: "FOUND",
      context: getContext({
        sources: [{ url: "https://acme.com/team?email=private@example.com" }],
      }),
      refreshAfter: new Date("2026-08-15T12:00:00.000Z"),
    });

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "miss" });
  });

  it("appends a sanitized found snapshot with a 30-day refresh window", async () => {
    const context = getContext();
    const researchStartedAt = new Date("2026-08-14T10:00:00.000Z");

    await expect(
      storePublicContactContext({
        email: "John@Acme.com",
        context,
        researchStartedAt,
      }),
    ).resolves.toBe(true);

    expect(prisma.publicContactSnapshot.create).toHaveBeenCalledWith({
      data: {
        identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: "FOUND",
        context,
        researchStartedAt,
        refreshAfter: new Date("2026-09-13T10:00:00.000Z"),
      },
    });
    expect(prisma.publicContactSnapshot.update).not.toHaveBeenCalled();
    expect(prisma.publicContactSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(
      prisma.publicContactSnapshot.create.mock.calls[0]?.[0].data,
    ).not.toHaveProperty("email");
  });

  it("refuses unsafe generated snapshots", async () => {
    const unsafe = getContext({
      sources: [{ url: "https://acme.com/team?api_key=abcdefghijklmnop" }],
    });

    await expect(
      storePublicContactContext({
        email: "john@acme.com",
        context: unsafe,
        researchStartedAt: new Date(),
      }),
    ).resolves.toBe(false);

    expect(prisma.publicContactSnapshot.create).not.toHaveBeenCalled();
  });

  it("appends not-found research with a 12-hour refresh window", async () => {
    const researchStartedAt = new Date("2026-08-14T10:00:00.000Z");

    await expect(
      storePublicContactContextNotFound({
        email: "john@acme.com",
        researchStartedAt,
      }),
    ).resolves.toBe(true);

    expect(prisma.publicContactSnapshot.create).toHaveBeenCalledWith({
      data: {
        identityHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        status: "NOT_FOUND",
        researchStartedAt,
        refreshAfter: new Date("2026-08-14T22:00:00.000Z"),
      },
    });
  });

  it("preserves every research result as a separate history row", async () => {
    await storePublicContactContext({
      email: "john@acme.com",
      context: getContext({ role: "Founder" }),
      researchStartedAt: new Date("2026-02-14T10:00:00.000Z"),
    });
    await storePublicContactContext({
      email: "john@acme.com",
      context: getContext({ role: "Founder and CEO" }),
      researchStartedAt: new Date("2026-08-14T10:00:00.000Z"),
    });

    expect(prisma.publicContactSnapshot.create).toHaveBeenCalledTimes(2);
    expect(prisma.publicContactSnapshot.update).not.toHaveBeenCalled();
    expect(prisma.publicContactSnapshot.deleteMany).not.toHaveBeenCalled();
  });
});

function getContext(
  overrides: Partial<PublicContactContext> = {},
): PublicContactContext {
  return {
    name: "John Smith",
    role: "Founder and CEO",
    company: {
      name: "Acme",
      domain: "acme.com",
      website: "https://acme.com",
      description: "Workflow software for growing teams.",
      industry: "Software",
      employeeCount: "Approximately 30 employees",
      funding: "$50M raised",
    },
    sources: [{ url: "https://acme.com/team" }],
    confidence: "high",
    ...overrides,
  };
}
