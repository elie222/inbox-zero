import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { submitContactCardExchange } from "./exchange";

const checkRateLimit = vi.fn();

vi.mock("@/utils/prisma");
vi.mock("@/utils/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  createRateLimitKey: (parts: string[]) => parts.join(":"),
  getClientIp: () => "203.0.113.7",
}));

const logger = createTestLogger();

describe("submitContactCardExchange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.contactCard.findFirst.mockResolvedValue({ id: "card-1" } as never);
    prisma.contactCardExchange.create.mockResolvedValue({} as never);
    checkRateLimit.mockResolvedValue({ limited: false });
  });

  it("stores the submission against the card", async () => {
    const result = await submit();

    expect(result).toEqual({ received: true });
    expect(prisma.contactCardExchange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contactCardId: "card-1",
        name: "Jane Rivera",
        email: "jane@company.com",
      }),
    });
  });

  it("lowercases the address so accepting can't duplicate a contact", async () => {
    await submit({ email: "  Jane@Company.com " });

    const { data } = prisma.contactCardExchange.create.mock.calls[0][0];
    expect(data.email).toBe("jane@company.com");
  });

  it("stores blank optional fields as null, not empty strings", async () => {
    await submit({ phone: "  ", companyTitle: "", note: "   " });

    const { data } = prisma.contactCardExchange.create.mock.calls[0][0];
    expect(data.phone).toBeNull();
    expect(data.companyTitle).toBeNull();
    expect(data.note).toBeNull();
  });

  // Anyone with the link can post here
  it("rejects once the rate limit trips", async () => {
    checkRateLimit.mockResolvedValue({
      limited: true,
      retryAfterSeconds: 3600,
    });

    await expect(submit()).rejects.toThrow("Too many submissions");
    expect(prisma.contactCardExchange.create).not.toHaveBeenCalled();
  });

  // Both a per-visitor and a per-card limit, so one card can't be flooded
  // from many addresses either
  it("checks a per-visitor and a per-card limit", async () => {
    await submit();

    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    const keys = checkRateLimit.mock.calls.map((call) => call[0].rule.key);
    expect(keys[0]).toContain("203.0.113.7");
    expect(keys[1]).toContain("card-1");
  });

  it("404s an unknown or inactive card without writing", async () => {
    prisma.contactCard.findFirst.mockResolvedValue(null);

    await expect(submit()).rejects.toThrow("Card not found");
    expect(prisma.contactCardExchange.create).not.toHaveBeenCalled();
  });

  // The submission is a stranger's personal details — counted, not logged
  it("keeps the submitted details out of the log", async () => {
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});

    await submit({ note: "met at NADA" });

    const logged = JSON.stringify(info.mock.calls);
    expect(logged).not.toContain("jane@company.com");
    expect(logged).not.toContain("met at NADA");
  });
});

function submit(
  overrides: Partial<{
    name: string;
    email: string;
    phone: string;
    companyTitle: string;
    note: string;
  }> = {},
) {
  return submitContactCardExchange({
    slug: "chris",
    submission: {
      name: "Jane Rivera",
      email: "jane@company.com",
      ...overrides,
    },
    headers: new Headers({ "x-forwarded-for": "203.0.113.7" }),
    logger,
  });
}
