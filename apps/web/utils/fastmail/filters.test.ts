import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyFastmailFilters,
  deleteFastmailFilter,
  saveFastmailFilter,
} from "./filters";
import prisma from "@/utils/__mocks__/prisma";
import { getMockMessage, getRule, getAction } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
vi.mock("@/utils/prisma");
beforeEach(() => vi.clearAllMocks());

describe("Fastmail managed sender filters", () => {
  it("applies only an exact sender match to incoming mail", async () => {
    const provider = createMockEmailProvider({ name: "fastmail" });
    const rule = {
      ...getRule(),
      id: "fastmail-filter-owned",
      enabled: true,
      from: "sender@example.com",
      actions: [getAction({ type: "ARCHIVE" })],
    };
    await applyFastmailFilters(
      getMockMessage({
        id: "matching",
        from: "Sender <sender@example.com>",
        labelIds: ["INBOX"],
      }),
      [rule],
      provider,
    );
    await applyFastmailFilters(
      getMockMessage({
        id: "other",
        from: "other-sender@example.com",
        labelIds: ["INBOX"],
      }),
      [rule],
      provider,
    );
    expect(provider.archiveMessage).toHaveBeenCalledExactlyOnceWith("matching");
  });
  it("deduplicates sender rules within an account and keeps accounts separate", async () => {
    await saveFastmailFilter("a", "Sender <sender@example.com>", [], true);
    await saveFastmailFilter("a", "sender@example.com", [], true);
    await saveFastmailFilter("b", "sender@example.com", [], true);
    const ids = prisma.rule.upsert.mock.calls.map(([args]) => args.create.id);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });
  it("refuses to delete rules owned by another feature", async () => {
    await expect(
      deleteFastmailFilter("account", "assistant-rule"),
    ).rejects.toThrow("managed filters");
    expect(prisma.rule.deleteMany).not.toHaveBeenCalled();
  });
});
