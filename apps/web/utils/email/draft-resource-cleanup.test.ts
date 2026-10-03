import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { discardDraftResource } from "./draft-resource";
import { cleanupDraftResources } from "./draft-resource-cleanup";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("./draft-resource", () => ({ discardDraftResource: vi.fn() }));
const logger = createScopedLogger("draft-resource-cleanup-test");
beforeEach(() => {
  vi.resetAllMocks();
  prisma.emailDraftResource.updateMany.mockResolvedValue({ count: 1 });
});
it("isolates account failures and still cleans later owned resources", async () => {
  prisma.emailDraftResource.findMany.mockResolvedValue(
    ["first", "second"].map((resourceKey) => ({
      resourceKey,
      emailAccountId: resourceKey,
      emailAccount: { account: { provider: "google" } },
    })) as never,
  );
  vi.mocked(createEmailProvider).mockRejectedValueOnce(
    new Error("first account offline"),
  );
  vi.mocked(createEmailProvider).mockResolvedValueOnce({
    name: "google",
  } as never);
  vi.mocked(discardDraftResource).mockResolvedValue({
    state: "CONSUMED",
  } as never);
  expect(await cleanupDraftResources(logger)).toEqual({
    examined: 2,
    consumed: 1,
    errors: 1,
  });
  expect(discardDraftResource).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: "second", resourceKey: "second" }),
  );
  expect(prisma.emailDraftResource.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        owner: "DISCARD",
        state: { in: ["NOT_CREATED", "CREATING", "READY"] },
      },
      take: 100,
    }),
  );
});
it("keeps in-flight resources pending instead of reporting successful deletion", async () => {
  prisma.emailDraftResource.findMany.mockResolvedValue([
    {
      resourceKey: "pending",
      emailAccountId: "account",
      emailAccount: { account: { provider: "google" } },
    },
  ] as never);
  vi.mocked(createEmailProvider).mockResolvedValue({ name: "google" } as never);
  vi.mocked(discardDraftResource).mockResolvedValue({
    state: "CREATING",
    owner: "DISCARD",
  } as never);
  expect(await cleanupDraftResources(logger)).toEqual({
    examined: 1,
    consumed: 0,
    errors: 0,
  });
});

it("rotates a full failed batch so a later healthy account runs on the next invocation", async () => {
  const pending = Array.from({ length: 101 }, (_, index) => ({
    id: `row-${index}`,
    resourceKey: `key-${index}`,
    emailAccountId: index === 100 ? "healthy" : "offline",
    updatedAt: index,
    emailAccount: { account: { provider: "google" } },
  }));
  let tick = 101;
  prisma.emailDraftResource.findMany.mockImplementation(
    async () =>
      pending
        .toSorted((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, 100) as never,
  );
  prisma.emailDraftResource.updateMany.mockImplementation(async ({ where }) => {
    const row = pending.find((row) => row.id === where.id);
    if (row) row.updatedAt = tick++;
    return { count: row ? 1 : 0 };
  });
  vi.mocked(createEmailProvider).mockImplementation(
    async ({ emailAccountId }) => {
      if (emailAccountId === "offline") throw new Error("offline");
      return { name: "google" } as never;
    },
  );
  vi.mocked(discardDraftResource).mockResolvedValue({
    state: "CONSUMED",
  } as never);
  expect((await cleanupDraftResources(logger)).consumed).toBe(0);
  expect((await cleanupDraftResources(logger)).consumed).toBe(1);
  expect(discardDraftResource).toHaveBeenCalledWith(
    expect.objectContaining({ accountId: "healthy", resourceKey: "key-100" }),
  );
});
