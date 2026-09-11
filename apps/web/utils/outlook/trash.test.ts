import { beforeEach, describe, expect, it, vi } from "vitest";
import { publishDelete } from "@inboxzero/tinybird";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookClient } from "@/utils/outlook/client";
import { trashThread } from "./trash";

vi.mock("@inboxzero/tinybird", () => ({ publishDelete: vi.fn() }));
vi.mock("@/utils/microsoft/retry", () => ({
  withMicrosoftGraphRetry: (fn: () => Promise<unknown>) => fn(),
  withMicrosoftGraphWriteRetry: (fn: () => Promise<unknown>) => fn(),
}));

const nextLink = "https://graph.microsoft.com/v1.0/me/messages?$skip=10";

describe("trashThread", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enumerates all pages before moving messages and deduplicates messages", async () => {
    const { options, get, post } = setup();
    get.mockResolvedValueOnce({
      value: [{ id: "a" }],
      "@odata.nextLink": nextLink,
    });
    get.mockResolvedValueOnce({ value: [], "@odata.nextLink": `${nextLink}0` });
    get.mockImplementationOnce(async () => {
      expect(post).not.toHaveBeenCalled();
      return { value: [{ id: "a" }, { id: "b" }] };
    });

    await expect(trashThread(options)).resolves.toEqual({ status: 200 });
    expect(post.mock.calls.map(([path]) => path)).toEqual([
      "/me/messages/a/move",
      "/me/messages/b/move",
    ]);
    expect(publishDelete).toHaveBeenCalledOnce();
  });

  it("rejects partial move failures without publishing successful deletion", async () => {
    const { options, get, post } = setup();
    get.mockResolvedValue({ value: [{ id: "a" }, { id: "b" }] });
    post.mockImplementation(async (path: string) => {
      if (path.includes("/b/")) throw new Error("Access denied");
    });

    await expect(trashThread(options)).rejects.toThrow("Access denied");
    expect(post).toHaveBeenCalledTimes(2);
    expect(publishDelete).not.toHaveBeenCalled();
  });

  it("does not fall back or mutate when a later page fails", async () => {
    const { options, get, post } = setup();
    get.mockResolvedValueOnce({
      value: [{ id: "a" }],
      "@odata.nextLink": nextLink,
    });
    get.mockRejectedValueOnce(new Error("Requested entity was not found"));
    get.mockResolvedValue({ value: [] });

    await expect(trashThread(options)).rejects.toThrow(
      "Requested entity was not found",
    );
    expect(post).not.toHaveBeenCalled();
    expect(publishDelete).not.toHaveBeenCalled();
  });

  it("rejects repeated pagination before moving any messages", async () => {
    const { options, get, post } = setup();
    get.mockResolvedValue({
      value: [{ id: "a" }],
      "@odata.nextLink": nextLink,
    });

    await expect(trashThread(options)).rejects.toThrow("pagination");
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps successful deletion successful when analytics fails", async () => {
    const { options, get } = setup();
    get.mockResolvedValue({ value: [{ id: "a" }] });
    vi.mocked(publishDelete).mockRejectedValueOnce(
      new Error("Analytics unavailable"),
    );
    await expect(trashThread(options)).resolves.toEqual({ status: 200 });
  });
});

function setup() {
  const get = vi.fn();
  const post = vi.fn().mockResolvedValue({});
  const api = vi.fn((path: string) => ({
    filter: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    get,
    post: (body: unknown) => post(path, body),
  }));
  return {
    get,
    post,
    options: {
      client: { getClient: () => ({ api }) } as unknown as OutlookClient,
      threadId: "conversation",
      ownerEmail: "user@example.com",
      actionSource: "user" as const,
      logger: createTestLogger(),
    },
  };
}
