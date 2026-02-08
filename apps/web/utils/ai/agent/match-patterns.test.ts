import { describe, expect, it, vi, beforeEach } from "vitest";
import { findMatchingPatterns } from "./match-patterns";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/prisma", () => ({
  default: {
    learnedPattern: { findMany: vi.fn() },
  },
}));

import prisma from "@/utils/prisma";

const logger = createScopedLogger("test");

const headers = {
  from: "newsletter@example.com",
  subject: "Weekly digest #42",
};

function makePattern(
  id: string,
  matcher: unknown,
  actions: Array<{ id: string; actionType: string; actionData: unknown }> = [
    { id: "a1", actionType: "archive", actionData: {} },
  ],
) {
  return {
    id,
    matcher,
    matcherHash: "hash",
    provider: "google",
    resourceType: "email",
    emailAccountId: "ea-1",
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    actions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findMatchingPatterns", () => {
  it("returns null when no patterns exist", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toBeNull();
  });

  it("matches from field (case-insensitive substring)", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "from", value: "example.com" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toMatchObject({ patternId: "p1" });
  });

  it("matches from field case-insensitively", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "from", value: "NEWSLETTER@EXAMPLE.COM" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toMatchObject({ patternId: "p1" });
  });

  it("does not match unrelated from", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "from", value: "other@domain.com" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toBeNull();
  });

  it("matches subject with exact substring", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "subject", value: "Weekly digest" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toMatchObject({ patternId: "p1" });
  });

  it("matches subject via generalized comparison (ignoring numbers)", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "subject", value: "Weekly digest #99" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers: { ...headers, subject: "Weekly digest #42" },
      logger,
    });

    expect(result).toMatchObject({ patternId: "p1" });
  });

  it("skips patterns with invalid matcher shape", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { bad: "shape" }),
      makePattern("p2", { field: "from", value: "example.com" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toMatchObject({ patternId: "p2" });
  });

  it("returns first match only", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "from", value: "example.com" }),
      makePattern("p2", { field: "from", value: "newsletter" }),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result).toMatchObject({ patternId: "p1" });
  });

  it("returns actions from the matched pattern", async () => {
    vi.mocked(prisma.learnedPattern.findMany).mockResolvedValue([
      makePattern("p1", { field: "from", value: "example.com" }, [
        { id: "a1", actionType: "archive", actionData: {} },
        {
          id: "a2",
          actionType: "label",
          actionData: { targetName: "Newsletter" },
        },
      ]),
    ]);

    const result = await findMatchingPatterns({
      emailAccountId: "ea-1",
      provider: "google",
      resourceType: "email",
      headers,
      logger,
    });

    expect(result?.actions).toEqual([
      { actionType: "archive", actionData: {} },
      { actionType: "label", actionData: { targetName: "Newsletter" } },
    ]);
  });
});
