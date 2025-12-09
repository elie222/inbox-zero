import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createOrganizationAction } from "@/utils/actions/organization";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "test@test.com" } })),
}));

describe("organization actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "test@test.com",
      account: { userId: "u1", provider: "google" },
    });
  });

  it("creates organization and owner membership with emailAccountId", async () => {
    prisma.member.findFirst.mockResolvedValue(null);
    prisma.organization.findUnique.mockResolvedValue(null as any);
    prisma.organization.create.mockResolvedValue({
      id: "org_1",
      name: "Acme",
      slug: "acme",
      createdAt: new Date(),
    } as any);
    prisma.member.create.mockResolvedValue({ id: "mem_1" } as any);

    const result = await createOrganizationAction(
      "ea_1" as any,
      { name: "Acme", slug: "acme" } as any,
    );

    expect(prisma.member.findFirst).toHaveBeenCalledWith({
      where: { emailAccountId: "ea_1" },
      select: { id: true },
    });
    expect(prisma.organization.create).toHaveBeenCalled();
    expect(prisma.member.create).toHaveBeenCalledWith({
      data: { organizationId: "org_1", emailAccountId: "ea_1", role: "owner" },
    });
    expect(result?.data).toMatchObject({
      id: "org_1",
      name: "Acme",
      slug: "acme",
    });
  });
});
