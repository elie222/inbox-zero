import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterNewSpamArrivals, learnObservedSpam } from "./worker-client";

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
    await filterNewSpamArrivals({
      emailAccountId: "account",
      observations: [observation],
      previous: {},
      initialized: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches only new Inbox arrivals in bounded batches", async () => {
    const arrivals = Array.from({ length: 21 }, (_, i) => ({
      ...observation,
      key: `new-${i}`,
      messageId: `new-${i}`,
    }));
    await filterNewSpamArrivals({
      emailAccountId: "account",
      observations: [
        observation,
        { ...observation, key: "archived", targets: ["@archive"] },
        ...arrivals,
      ],
      previous: { [observation.key]: observation },
      initialized: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const batches = fetchMock.mock.calls.map(([, options]) =>
      JSON.parse(options.body),
    );
    expect(batches.map((batch) => batch.arrivals.length)).toEqual([20, 1]);
    expect(batches.flatMap((batch) => batch.arrivals)).toEqual(arrivals);
    expect(fetchMock.mock.calls[0][1].headers["x-api-key"]).toBe("test-key");
  });

  it("leaves topic-only corrections local", async () => {
    expect(
      await learnObservedSpam("account", {
        before: observation,
        after: { ...observation, targets: ["Purchases"] },
        since: 1000,
      }),
    ).toBe("ignored");
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("propagates server errors so the observation can be retried", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(
      filterNewSpamArrivals({
        emailAccountId: "account",
        observations: [observation],
        previous: {},
        initialized: true,
      }),
    ).rejects.toThrow("Spam observer returned 503");
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
