import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { processNewMailArrivals, learnObservedSpam } from "./worker-client";

const observation = {
  key: "message",
  messageId: "message",
  threadId: "thread",
  sender: "sender@example.com",
  recipients: [],
  subject: "subject",
  targets: ["@inbox"],
  observedAt: 1000,
};
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3100");
  vi.stubEnv("INTERNAL_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    json: async () => ({ outcome: "learned" }),
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("standalone spam observer client", () => {
  it("does not sweep the initial or reset snapshot", async () => {
    await processNewMailArrivals({
      emailAccountId: "account",
      observations: [observation],
      previous: {},
      initialized: false,
      pending: {},
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches and acknowledges each new Inbox arrival separately", async () => {
    const arrivals = Array.from({ length: 21 }, (_, i) => ({
      ...observation,
      key: `new-${i}`,
      messageId: `new-${i}`,
    }));
    await processNewMailArrivals({
      emailAccountId: "account",
      observations: [
        observation,
        { ...observation, key: "archived", targets: ["@archive"] },
        ...arrivals,
      ],
      previous: { [observation.key]: observation },
      initialized: true,
      pending: {},
    });
    expect(fetchMock).toHaveBeenCalledTimes(21);
    const batches = fetchMock.mock.calls.map(([, options]) =>
      JSON.parse(options.body),
    );
    expect(batches.every((batch) => batch.arrivals.length === 1)).toBe(true);
    expect(batches.flatMap((batch) => batch.arrivals)).toEqual(arrivals);
    expect(fetchMock.mock.calls[0][1].headers["x-api-key"]).toBe("test-key");
  });

  it("checks topic changes for spam rescues that happened between snapshots", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ outcome: "ignored" }),
    });
    expect(
      await learnObservedSpam("account", {
        before: observation,
        after: { ...observation, targets: ["Purchases"] },
        since: 1000,
      }),
    ).toBe("ignored");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).kind).toBe("correction");
  });

  it("dispatches a Junk rescue for server-side training", async () => {
    expect(
      await learnObservedSpam("account", {
        before: { ...observation, targets: ["@junk"] },
        after: observation,
        since: 1000,
      }),
    ).toBe("learned");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).kind).toBe("correction");
  });

  it("persists failed arrivals for retry after the observation checkpoint advances", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const pending = {};
    const errors = await processNewMailArrivals({
      emailAccountId: "account",
      observations: [observation],
      previous: {},
      initialized: true,
      pending,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe("Spam observer returned 503");
    const restoredPending = JSON.parse(JSON.stringify(pending));
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ outcome: "processed" }),
    });
    expect(
      await processNewMailArrivals({
        emailAccountId: "account",
        observations: [observation],
        previous: { [observation.key]: observation },
        initialized: true,
        pending: restoredPending,
      }),
    ).toEqual([]);
    expect(restoredPending).toEqual({});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains only failed arrivals and continues processing other mail", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    const other = { ...observation, key: "other", messageId: "other" };
    const pending = {};
    const errors = await processNewMailArrivals({
      emailAccountId: "account",
      observations: [observation, other],
      previous: {},
      initialized: true,
      pending,
    });
    expect(errors).toHaveLength(1);
    expect(pending).toEqual({ [observation.key]: observation });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an invalid correction response", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ outcome: "invalid" }),
    });
    await expect(
      learnObservedSpam("account", {
        before: observation,
        after: { ...observation, targets: ["@junk"] },
        since: 1000,
      }),
    ).rejects.toThrow("Invalid spam observer response");
  });
});

describe("filing after reading", () => {
  const unread = { ...observation, isRead: false, isFlagged: false };
  const read = { ...unread, isRead: true };
  it("checks new mail for spam, keeps deferred mail across restarts, then files after reading", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deferred: [unread.key] }),
    });
    const pending = {};
    const options = {
      emailAccountId: "account",
      initialized: true,
      pending,
      fileAfterReading: true,
    };
    await processNewMailArrivals({
      ...options,
      observations: [unread],
      previous: {},
    });
    expect(pending).toEqual({ [unread.key]: unread });
    const restored = JSON.parse(JSON.stringify(pending));
    await processNewMailArrivals({
      ...options,
      pending: restored,
      observations: [unread],
      previous: { [unread.key]: unread },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await processNewMailArrivals({
      ...options,
      pending: restored,
      observations: [read],
      previous: { [unread.key]: unread },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(restored).toEqual({});
  });
  it("holds read flagged messages until their flag is removed", async () => {
    const flagged = { ...read, isFlagged: true };
    const pending = { [flagged.key]: flagged };
    const options = {
      emailAccountId: "account",
      initialized: true,
      pending,
      fileAfterReading: true,
    };
    await processNewMailArrivals({
      ...options,
      observations: [flagged],
      previous: { [flagged.key]: flagged },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await processNewMailArrivals({
      ...options,
      observations: [read],
      previous: { [flagged.key]: flagged },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(pending).toEqual({});
  });
  it("removes pending work after a manual move out of Inbox", async () => {
    const pending = { [read.key]: read };
    await processNewMailArrivals({
      emailAccountId: "account",
      initialized: true,
      pending,
      fileAfterReading: true,
      observations: [{ ...read, targets: ["Purchases"] }],
      previous: { [read.key]: read },
    });
    expect(pending).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
