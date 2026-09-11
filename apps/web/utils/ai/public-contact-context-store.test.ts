import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import type { PublicContactContext } from "@/utils/ai/public-contact-context-schema";

vi.mock("@/utils/prisma");

import {
  getStoredPublicContactContext,
  storePublicContactContext,
  storePublicContactContextNotFound,
} from "@/utils/ai/public-contact-context-store";

describe("public contact context store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the latest fresh public research", async () => {
    const context = getContext();
    prisma.contactResearch.findFirst.mockResolvedValue({
      found: true,
      ...context,
      researchStartedAt: new Date("2026-07-20T12:00:00.000Z"),
    } as never);

    await expect(
      getStoredPublicContactContext("John@Acme.com"),
    ).resolves.toEqual({ status: "found", context });

    expect(prisma.contactResearch.findFirst).toHaveBeenCalledWith({
      where: { email: "john@acme.com" },
      orderBy: [
        { researchStartedAt: "desc" },
        { createdAt: "desc" },
        { id: "desc" },
      ],
      select: {
        found: true,
        role: true,
        company: true,
        sources: true,
        confidence: true,
        researchStartedAt: true,
      },
    });
  });

  it("keeps stale history but treats old found research as a cache miss", async () => {
    prisma.contactResearch.findFirst.mockResolvedValue({
      found: true,
      ...getContext(),
      researchStartedAt: new Date("2026-07-15T11:59:59.999Z"),
    } as never);

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "miss" });

    expect(prisma.contactResearch.deleteMany).not.toHaveBeenCalled();
  });

  it("returns fresh not-found research", async () => {
    prisma.contactResearch.findFirst.mockResolvedValue({
      found: false,
      role: null,
      company: null,
      sources: [],
      confidence: null,
      researchStartedAt: new Date("2026-08-14T01:00:00.000Z"),
    } as never);

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "not_found" });
  });

  it("treats not-found research as stale after 12 hours", async () => {
    prisma.contactResearch.findFirst.mockResolvedValue({
      found: false,
      role: null,
      company: null,
      sources: [],
      confidence: null,
      researchStartedAt: new Date("2026-08-13T23:59:59.999Z"),
    } as never);

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "miss" });
  });

  it("fails closed when durable storage is unavailable", async () => {
    prisma.contactResearch.findFirst.mockRejectedValue(
      new Error("Database unavailable"),
    );

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "unavailable" });
  });

  it("ignores malformed or unsafe stored research", async () => {
    prisma.contactResearch.findFirst.mockResolvedValue({
      found: true,
      ...getContext({
        sources: ["https://acme.com/team?email=private@example.com"],
      }),
      researchStartedAt: new Date("2026-08-14T10:00:00.000Z"),
    } as never);

    await expect(
      getStoredPublicContactContext("john@acme.com"),
    ).resolves.toEqual({ status: "miss" });
  });

  it("appends sanitized found research using explicit fields", async () => {
    const context = getContext();
    const researchStartedAt = new Date("2026-08-14T10:00:00.000Z");

    await expect(
      storePublicContactContext({
        email: "John@Acme.com",
        context,
        researchStartedAt,
      }),
    ).resolves.toBe(true);

    expect(prisma.contactResearch.create).toHaveBeenCalledWith({
      data: {
        email: "john@acme.com",
        found: true,
        role: context.role,
        confidence: context.confidence,
        company: context.company,
        sources: context.sources,
        researchStartedAt,
      },
    });
    expect(prisma.contactResearch.update).not.toHaveBeenCalled();
    expect(prisma.contactResearch.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses unsafe generated research", async () => {
    const unsafe = getContext({
      sources: ["https://acme.com/team?api_key=abcdefghijklmnop"],
    });

    await expect(
      storePublicContactContext({
        email: "john@acme.com",
        context: unsafe,
        researchStartedAt: new Date(),
      }),
    ).resolves.toBe(false);

    expect(prisma.contactResearch.create).not.toHaveBeenCalled();
  });

  it("appends not-found research without placeholder profile fields", async () => {
    const researchStartedAt = new Date("2026-08-14T10:00:00.000Z");

    await expect(
      storePublicContactContextNotFound({
        email: "John@Acme.com",
        researchStartedAt,
      }),
    ).resolves.toBe(true);

    expect(prisma.contactResearch.create).toHaveBeenCalledWith({
      data: {
        email: "john@acme.com",
        found: false,
        researchStartedAt,
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

    expect(prisma.contactResearch.create).toHaveBeenCalledTimes(2);
    expect(prisma.contactResearch.update).not.toHaveBeenCalled();
    expect(prisma.contactResearch.deleteMany).not.toHaveBeenCalled();
  });
});

function getContext(
  overrides: Partial<PublicContactContext> = {},
): PublicContactContext {
  return {
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
    sources: ["https://acme.com/team"],
    confidence: "high",
    ...overrides,
  };
}
