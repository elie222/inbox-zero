import { describe, expect, it, vi } from "vitest";
import { assessUser } from "@/utils/assess";
import { createScopedLogger } from "@/utils/logger";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";

const logger = createScopedLogger("assess-test");

describe("assessUser", () => {
  it.each([
    "google",
    "microsoft",
  ] as const)("reads filter and forwarding counts through the %s provider", async (name) => {
    const client = createMockEmailProvider({
      name,
      getFiltersList: vi
        .fn()
        .mockResolvedValue([{ id: "f1" }, { id: "f2" }, { id: "f3" }]),
      getForwardingAddresses: vi
        .fn()
        .mockResolvedValue(["forward@example.com"]),
      getSentMessages: vi.fn().mockResolvedValue([]),
    });

    const result = await assessUser({ client, logger });

    expect(result.filtersCount).toBe(3);
    expect(result.forwardingAddressesCount).toBe(1);
  });

  it("treats provider settings failures as zero instead of failing the assessment", async () => {
    const client = createMockEmailProvider({
      getFiltersList: vi.fn().mockRejectedValue(new Error("boom")),
      getForwardingAddresses: vi
        .fn()
        .mockRejectedValue(new Error("Forwarding disabled")),
      getSentMessages: vi.fn().mockResolvedValue([]),
    });

    const result = await assessUser({ client, logger });

    expect(result.filtersCount).toBe(0);
    expect(result.forwardingAddressesCount).toBe(0);
  });
});
