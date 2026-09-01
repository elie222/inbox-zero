import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { connectLemonCustomerAsAdmin } from "./admin";

const mocks = vi.hoisted(() => ({
  getLemonCustomer: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/ee/billing/lemon/index", () => ({
  getLemonCustomer: mocks.getLemonCustomer,
}));

describe("connectLemonCustomerAsAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("connects the linked user whose login matches the customer email", async () => {
    mocks.getLemonCustomer.mockResolvedValue(
      getCustomerResponse("OWNER@EXAMPLE.COM"),
    );

    const result = await connectLemonCustomerAsAdmin({
      customerId: 123,
      premium: {
        id: "premium-1",
        users: [
          { id: "user-1", email: "owner@example.com", emailAccounts: [] },
          { id: "user-2", email: "member@example.com", emailAccounts: [] },
        ],
      },
      logger: createTestLogger(),
    });

    expect(result).toBe(true);
    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: {
        id: "premium-1",
        users: { some: { id: "user-1" } },
      },
      data: { admins: { connect: { id: "user-1" } } },
    });
  });

  it("matches the customer email to an email account owned by a linked user", async () => {
    mocks.getLemonCustomer.mockResolvedValue(
      getCustomerResponse("billing@example.com"),
    );

    const result = await connectLemonCustomerAsAdmin({
      customerId: 123,
      premium: {
        id: "premium-1",
        users: [
          {
            id: "user-1",
            email: "login@example.com",
            emailAccounts: [{ email: "billing@example.com" }],
          },
        ],
      },
      logger: createTestLogger(),
    });

    expect(result).toBe(true);
    expect(prisma.premium.update).toHaveBeenCalledWith({
      where: {
        id: "premium-1",
        users: { some: { id: "user-1" } },
      },
      data: { admins: { connect: { id: "user-1" } } },
    });
  });

  it("skips customers that do not match a linked user", async () => {
    mocks.getLemonCustomer.mockResolvedValue(
      getCustomerResponse("someone-else@example.com"),
    );

    const result = await connectLemonCustomerAsAdmin({
      customerId: 123,
      premium: {
        id: "premium-1",
        users: [
          { id: "user-1", email: "owner@example.com", emailAccounts: [] },
        ],
      },
      logger: createTestLogger(),
    });

    expect(result).toBe(false);
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });

  it("skips ambiguous matches", async () => {
    mocks.getLemonCustomer.mockResolvedValue(
      getCustomerResponse("shared@example.com"),
    );

    const result = await connectLemonCustomerAsAdmin({
      customerId: 123,
      premium: {
        id: "premium-1",
        users: [
          { id: "user-1", email: "shared@example.com", emailAccounts: [] },
          {
            id: "user-2",
            email: "other@example.com",
            emailAccounts: [{ email: "shared@example.com" }],
          },
        ],
      },
      logger: createTestLogger(),
    });

    expect(result).toBe(false);
    expect(prisma.premium.update).not.toHaveBeenCalled();
  });

  it("propagates Lemon Squeezy API errors", async () => {
    const error = new Error("Lemon Squeezy unavailable");
    mocks.getLemonCustomer.mockResolvedValue({ data: null, error });

    await expect(
      connectLemonCustomerAsAdmin({
        customerId: 123,
        premium: {
          id: "premium-1",
          users: [
            { id: "user-1", email: "owner@example.com", emailAccounts: [] },
          ],
        },
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Lemon Squeezy unavailable");

    expect(prisma.premium.update).not.toHaveBeenCalled();
  });
});

function getCustomerResponse(email: string) {
  return {
    data: {
      data: {
        attributes: { email },
      },
    },
    error: null,
  };
}
