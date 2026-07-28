import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/__mocks__/prisma";
import { recordContactCardView } from "./views";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

describe("recordContactCardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.contactCard.findFirst.mockResolvedValue({ id: "card-1" } as never);
    prisma.contactCardView.create.mockResolvedValue({} as never);
  });

  it("counts a view against the card", async () => {
    const result = await recordContactCardView({
      slug: "chris",
      headers: viewHeaders(),
      logger,
    });

    expect(result).toEqual({ counted: true });
    expect(prisma.contactCardView.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contactCardId: "card-1" }),
    });
  });

  // Stats must never hold an address; the visitor is a salted digest
  it("stores a hashed visitor, not the IP or user agent", async () => {
    await recordContactCardView({
      slug: "chris",
      headers: viewHeaders(),
      logger,
    });

    const { data } = prisma.contactCardView.create.mock.calls[0][0];
    expect(data.visitorHash).not.toContain("203.0.113.7");
    expect(data.visitorHash).not.toContain("Mozilla");
    expect(data.visitorHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("gives different visitors different hashes", async () => {
    await recordContactCardView({
      slug: "chris",
      headers: viewHeaders({ ip: "203.0.113.7" }),
      logger,
    });
    await recordContactCardView({
      slug: "chris",
      headers: viewHeaders({ ip: "198.51.100.4" }),
      logger,
    });

    const [first, second] = prisma.contactCardView.create.mock.calls.map(
      (call) => call[0].data.visitorHash,
    );
    expect(first).not.toBe(second);
  });

  // The unique index is the dedupe — a refresh must not bump the count
  it("doesn't count a visitor twice in one day", async () => {
    prisma.contactCardView.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "7.0.0",
      }),
    );

    const result = await recordContactCardView({
      slug: "chris",
      headers: viewHeaders(),
      logger,
    });

    expect(result).toEqual({ counted: false });
  });

  it("keeps only the referrer's origin", async () => {
    await recordContactCardView({
      slug: "chris",
      headers: viewHeaders({
        referer: "https://mail.example.com/inbox?token=secret",
      }),
      logger,
    });

    const { data } = prisma.contactCardView.create.mock.calls[0][0];
    expect(data.referrer).toBe("https://mail.example.com");
  });

  it("ignores a slug with no live card", async () => {
    prisma.contactCard.findFirst.mockResolvedValue(null);

    const result = await recordContactCardView({
      slug: "nobody",
      headers: viewHeaders(),
      logger,
    });

    expect(result).toEqual({ counted: false });
    expect(prisma.contactCardView.create).not.toHaveBeenCalled();
  });
});

function viewHeaders({
  ip = "203.0.113.7",
  referer,
}: {
  ip?: string;
  referer?: string;
} = {}) {
  return new Headers({
    "x-forwarded-for": ip,
    "user-agent": "Mozilla/5.0 (iPhone)",
    ...(referer ? { referer } : {}),
  });
}
