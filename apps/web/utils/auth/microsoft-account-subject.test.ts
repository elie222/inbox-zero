import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileMicrosoftAccountSubject } from "@/utils/auth/microsoft-account-subject";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");

const legacyAccount = { id: "account", userId: "user" };

describe("reconcileMicrosoftAccountSubject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.account.findUnique.mockResolvedValue(null);
  });

  it("re-keys an account stored under the legacy subject", async () => {
    prisma.account.findUnique.mockResolvedValueOnce(
      legacyAccount as Awaited<ReturnType<typeof prisma.account.findUnique>>,
    );

    await reconcileMicrosoftAccountSubject({ oid: "oid", sub: "sub" });

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "account" },
      data: { providerAccountId: "oid" },
    });
  });

  it("leaves both rows alone when the object id is already taken", async () => {
    prisma.account.findUnique
      .mockResolvedValueOnce(
        legacyAccount as Awaited<ReturnType<typeof prisma.account.findUnique>>,
      )
      .mockResolvedValueOnce({ id: "other", userId: "user" } as Awaited<
        ReturnType<typeof prisma.account.findUnique>
      >);

    await reconcileMicrosoftAccountSubject({ oid: "oid", sub: "sub" });

    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("does nothing when no account uses the legacy subject", async () => {
    await reconcileMicrosoftAccountSubject({ oid: "oid", sub: "sub" });

    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it.each([
    { oid: null, sub: "sub" },
    { oid: "oid", sub: null },
    { oid: "same", sub: "same" },
  ])("makes no query for claims %o", async (claims) => {
    await reconcileMicrosoftAccountSubject(claims);

    expect(prisma.account.findUnique).not.toHaveBeenCalled();
  });
});
