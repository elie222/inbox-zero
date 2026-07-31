import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { createFilter } from "@/utils/gmail/filter";

vi.mock("@/utils/gmail/retry", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/gmail/retry")>();

  return {
    ...original,
    withGmailRetry: <T>(operation: () => Promise<T>) => operation(),
  };
});

const logger = createScopedLogger("gmail-filter-test");

describe("createFilter", () => {
  const create = vi.fn();
  const list = vi.fn();
  const gmail = {
    users: {
      settings: {
        filters: { create, list },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not make a filter-list request after a rate-limit error", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("Provider request was throttled"), {
        response: {
          status: 403,
          data: {
            error: {
              errors: [{ reason: "rateLimitExceeded" }],
            },
          },
        },
      }),
    );

    await expect(
      createFilter({
        gmail: gmail as never,
        from: "sender@example.com",
        logger,
      }),
    ).rejects.toThrow("Provider request was throttled");

    expect(list).not.toHaveBeenCalled();
  });

  it("still diagnoses the Gmail filter limit for other eligible errors", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("Filter creation failed"), {
        response: { status: 400 },
      }),
    );
    list.mockResolvedValue({
      data: { filter: Array.from({ length: 990 }, (_, index) => ({ index })) },
    });

    await expect(
      createFilter({
        gmail: gmail as never,
        from: "sender@example.com",
        logger,
      }),
    ).rejects.toThrow(SafeError);

    expect(list).toHaveBeenCalledOnce();
  });
});
