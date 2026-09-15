import { describe, expect, it, vi } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import { hasPreviousCommunicationsWithSenderOrDomain } from "./message";
import { getBatch } from "./batch";

vi.mock("./batch", () => ({ getBatch: vi.fn() }));
vi.mock("./client", () => ({
  getAccessTokenFromClient: vi.fn(() => "test-token"),
}));

describe("Gmail prior contact excluding cold labels", () => {
  const options = {
    from: "bob@vendor.example",
    date: new Date("2026-09-01T00:00:00Z"),
    messageId: "current",
    excludeLabelIds: ["cold-label"],
  };

  function client(
    pages: string[][],
    labels: Record<string, string[] | undefined>,
  ) {
    vi.mocked(getBatch).mockReset();
    vi.mocked(getBatch).mockImplementation(async (ids) =>
      ids.map((id) => ({ id, labelIds: labels[id] })),
    );
    const list = vi.fn().mockImplementation(({ pageToken }) => {
      const page = Number(pageToken ?? 0);
      return {
        data: {
          messages: pages[page].map((id) => ({ id, threadId: id })),
          nextPageToken: page + 1 < pages.length ? String(page + 1) : undefined,
        },
      };
    });
    const get = vi
      .fn()
      .mockImplementation(({ id }) => ({ data: { id, labelIds: labels[id] } }));
    return {
      gmail: {
        users: { messages: { list, get } },
      } as unknown as gmail_v1.Gmail,
      list,
      get,
    };
  }

  it("does not let prior cold mail whitelist another person at the domain", async () => {
    const { gmail } = client([["alice"]], { alice: ["cold-label"] });
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).resolves.toBe(false);
  });

  it("keeps searching past cold messages for genuine prior contact", async () => {
    const { gmail, list } = client([["alice"], ["warm"]], {
      alice: ["cold-label"],
      warm: [],
    });
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("preserves outbound contact even when a cold label remains", async () => {
    const { gmail } = client([["reply"]], { reply: ["SENT", "cold-label"] });
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).resolves.toBe(true);
  });

  it("ignores the current message and searches public senders by full address", async () => {
    const { gmail, list, get } = client([["current"]], {});
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, {
        ...options,
        from: "bob@gmail.com",
      }),
    ).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(list.mock.calls[0][0].q).toContain(
      "from:bob@gmail.com OR to:bob@gmail.com",
    );
  });

  it("compares IDs directly without inserting special label characters into search", async () => {
    const id = 'Cold "mail" \\ /';
    const { gmail, list } = client([["alice"]], { alice: [id] });
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, {
        ...options,
        excludeLabelIds: [id],
      }),
    ).resolves.toBe(false);
    expect(list.mock.calls[0][0].q).not.toContain(id);
  });

  it("assumes contact if cold messages exhaust the search budget", async () => {
    const { gmail, list } = client(
      Array.from({ length: 11 }, () => ["cold"]),
      { cold: ["cold-label"] },
    );
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).resolves.toBe(true);
    expect(list).toHaveBeenCalledTimes(10);
  });

  it("propagates unreadable metadata to the fail-safe caller", async () => {
    const { gmail } = client([["missing"]], {});
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).rejects.toThrow("Missing prior message labels");
  });

  it("fetches a page of metadata in one bounded batch", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `cold-${i}`);
    const { gmail, get } = client(
      [ids],
      Object.fromEntries(ids.map((id) => [id, ["cold-label"]])),
    );
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).resolves.toBe(false);
    expect(getBatch).toHaveBeenCalledTimes(1);
    expect(getBatch).toHaveBeenCalledWith(
      ids,
      "/gmail/v1/users/me/messages",
      "test-token",
      "format=minimal&fields=id,labelIds",
    );
    expect(get).not.toHaveBeenCalled();
  });

  it("propagates skipped batch failures to the fail-safe caller", async () => {
    const { gmail } = client([["missing"]], {});
    vi.mocked(getBatch).mockResolvedValue([
      { error: { code: 404, message: "Not found" } },
    ]);
    await expect(
      hasPreviousCommunicationsWithSenderOrDomain(gmail, options),
    ).rejects.toThrow("Missing prior message metadata");
  });
});
