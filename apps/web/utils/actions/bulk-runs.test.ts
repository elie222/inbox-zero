import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { startBulkRunAction, controlBulkRunAction } from "./bulk-runs";
import { assertBulkRunAccess } from "@/utils/bulk-rules/access";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "owner", email: "owner@example.test" },
  })),
}));
vi.mock("@/utils/bulk-rules/access", () => ({ assertBulkRunAccess: vi.fn() }));
const options = {
  startDate: new Date("2026-01-01"),
  includeRead: true,
  rerun: true,
  generateDraftReplies: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  prisma.emailAccount.findUnique.mockResolvedValue({
    email: "owner@example.test",
    account: { userId: "owner", provider: "google" },
  } as never);
  vi.mocked(assertBulkRunAccess).mockResolvedValue(200);
  prisma.bulkRuleRun.create.mockResolvedValue({ id: "run" } as never);
});
describe("bulk run controls", () => {
  it("persists the selected options and server-enforced limit before returning", async () => {
    const result = await startBulkRunAction("account", options);
    expect(result?.data).toEqual({ runId: "run" });
    expect(prisma.bulkRuleRun.create).toHaveBeenCalledWith({
      data: {
        ...options,
        emailAccountId: "account",
        activeAccountId: "account",
        maxEmails: 200,
      },
    });
  });
  it("rejects another user's account before enqueueing work", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "someone@example.test",
      account: { userId: "other", provider: "google" },
    } as never);
    const result = await startBulkRunAction("account", options);
    expect(result?.serverError).toBeTruthy();
    expect(prisma.bulkRuleRun.create).not.toHaveBeenCalled();
  });
  it("keeps the account reserved while a stopped email is still in flight", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      id: "run",
      leaseUntil: new Date(Date.now() + 60_000),
    } as never);
    await controlBulkRunAction("account", { runId: "run", command: "stop" });
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith({
      where: {
        id: "run",
        emailAccountId: "account",
        activeAccountId: "account",
      },
      data: { status: "STOPPED", activeAccountId: "account" },
    });
  });

  it("clears an automatic retry delay when the user explicitly resumes", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      id: "run",
      scannedAt: new Date(),
      status: "PAUSED",
    } as never);
    await controlBulkRunAction("account", { runId: "run", command: "resume" });
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith({
      where: { id: "run", emailAccountId: "account", status: "PAUSED" },
      data: { status: "RUNNING", error: null, retryAt: null, retryCount: 0 },
    });
  });
  it("does not accept an inverted date range", async () => {
    const result = await startBulkRunAction("account", {
      ...options,
      endDate: new Date("2025-01-01"),
    });
    expect(result?.validationErrors).toBeTruthy();
    expect(prisma.bulkRuleRun.create).not.toHaveBeenCalled();
  });
});
