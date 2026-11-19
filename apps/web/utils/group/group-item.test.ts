import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { deleteGroupItem } from "./group-item";

vi.mock("@/utils/prisma");

describe("deleteGroupItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows repeated removal when the pattern is already gone", async () => {
    prisma.groupItem.delete.mockRejectedValue(new Error("Record not found"));
    prisma.groupItem.deleteMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await deleteGroupItem({ id: "pattern-1", emailAccountId: "account-1" });
    await expect(
      deleteGroupItem({ id: "pattern-1", emailAccountId: "account-1" }),
    ).resolves.toBeUndefined();

    expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
      where: { id: "pattern-1", group: { emailAccountId: "account-1" } },
    });
  });

  it("still propagates database failures", async () => {
    const error = new Error("Database unavailable");
    prisma.groupItem.delete.mockRejectedValue(error);
    prisma.groupItem.deleteMany.mockRejectedValue(error);

    await expect(
      deleteGroupItem({ id: "pattern-1", emailAccountId: "account-1" }),
    ).rejects.toBe(error);
  });
});
