import type { gmail_v1 } from "@googleapis/gmail";
import type { ImapFlow } from "imapflow";
import { describe, expect, it, vi } from "vitest";
import { observeChanges, type ObservationState } from "./changes";
import {
  googleStateSchema,
  imapStateSchema,
  readGoogleCorrections,
  readICloudCorrections,
} from "./providers";

const targets = {
  INBOX: "@inbox",
  SPAM: "@junk",
  TRASH: "@trash",
  old: "Services",
  next: "Purchases",
};
const empty = (): ObservationState => ({ observed: {}, pending: {} });
function google() {
  const profile = vi.fn().mockResolvedValue({ data: { historyId: "10" } });
  const history = vi.fn().mockResolvedValue({ data: { historyId: "20" } });
  const get = vi.fn().mockResolvedValue({
    data: {
      id: "m",
      threadId: "t",
      historyId: "20",
      labelIds: ["next"],
      payload: {
        headers: [
          { name: "From", value: "Sender <sender@example.test>" },
          { name: "Subject", value: "Receipt" },
        ],
      },
    },
  });
  return {
    profile,
    history,
    get,
    api: {
      users: {
        getProfile: profile,
        history: { list: history },
        messages: { get },
      },
    } as unknown as gmail_v1.Gmail,
  };
}
const moved = {
  labelsAdded: [{ message: { id: "m" }, labelIds: ["next"] }],
  labelsRemoved: [{ message: { id: "m" }, labelIds: ["old"] }],
};

describe("Gmail correction history", () => {
  it.each([
    "UNREAD",
    "STARRED",
  ])("observes %s changes without requiring a folder move", async (label) => {
    const g = google();
    const state = googleStateSchema.parse({
      historyId: "10",
      checkpointAt: 100,
    });
    const observations = empty();
    g.history.mockResolvedValue({
      data: {
        historyId: "20",
        history: [
          { labelsRemoved: [{ message: { id: "m" }, labelIds: [label] }] },
        ],
      },
    });
    g.get.mockResolvedValue({
      data: {
        id: "m",
        threadId: "t",
        historyId: "20",
        labelIds: ["INBOX"],
        payload: { headers: [] },
      },
    });
    const result = await readGoogleCorrections({
      api: g.api,
      state,
      observations,
      targets,
      now: 200,
    });
    expect(result.current[0]).toMatchObject({
      isRead: true,
      isFlagged: false,
      targets: ["@inbox"],
    });
  });
  it("establishes a checkpoint without reading or training old messages", async () => {
    const g = google();
    const state = googleStateSchema.parse({});
    expect(
      await readGoogleCorrections({
        api: g.api,
        state,
        observations: empty(),
        targets,
        now: 100,
      }),
    ).toEqual({ reset: true, current: [] });
    expect(state.historyId).toBe("10");
    expect(g.get).not.toHaveBeenCalled();
  });
  it("waits for all history pages before reconstructing a move", async () => {
    const g = google();
    const state = googleStateSchema.parse({
      historyId: "10",
      checkpointAt: 100,
    });
    const observations = empty();
    g.history.mockResolvedValueOnce({
      data: {
        historyId: "20",
        nextPageToken: "p",
        history: [{ labelsAdded: moved.labelsAdded }],
      },
    });
    g.history.mockResolvedValueOnce({
      data: {
        historyId: "20",
        history: [{ labelsRemoved: moved.labelsRemoved }],
      },
    });
    expect(
      (
        await readGoogleCorrections({
          api: g.api,
          state,
          observations,
          targets,
          now: 200,
        })
      ).current,
    ).toEqual([]);
    expect(g.get).not.toHaveBeenCalled();
    const result = await readGoogleCorrections({
      api: g.api,
      state,
      observations,
      targets,
      now: 300,
    });
    expect(observations.observed.m.targets).toEqual(["Services"]);
    expect(observations.observed.m.observedAt).toBe(100);
    expect(result.current[0].targets).toEqual(["Purchases"]);
    expect(g.get.mock.calls[0][0].format).toBe("metadata");
  });
  it("baselines new arrivals across pages, then learns their later moves", async () => {
    const g = google();
    const state = googleStateSchema.parse({ historyId: "10" });
    const observations = empty();
    g.history.mockResolvedValueOnce({
      data: { historyId: "20", nextPageToken: "p", history: [moved] },
    });
    g.history.mockResolvedValueOnce({
      data: {
        historyId: "20",
        history: [{ messagesAdded: [{ message: { id: "m" } }] }],
      },
    });
    await readGoogleCorrections({
      api: g.api,
      state,
      observations,
      targets,
      now: 100,
    });
    const arrival = await readGoogleCorrections({
      api: g.api,
      state,
      observations,
      targets,
      now: 200,
    });
    expect(observeChanges(observations, arrival.current, 200, 30)).toEqual([]);
    expect(observations.pending).toEqual({});
    g.history.mockResolvedValueOnce({
      data: {
        historyId: "30",
        history: [
          {
            labelsRemoved: moved.labelsAdded,
            labelsAdded: moved.labelsRemoved,
          },
        ],
      },
    });
    g.get.mockResolvedValueOnce({
      data: { id: "m", historyId: "30", labelIds: ["old"] },
    });
    const next = await readGoogleCorrections({
      api: g.api,
      state,
      observations,
      targets,
      now: 300,
    });
    observeChanges(observations, next.current, 300, 30);
    expect(observations.pending.m.before.targets).toEqual(["Purchases"]);
    expect(observations.pending.m.after.targets).toEqual(["Services"]);
  });
  it("retains bounded backlog across serialized checkpoints", async () => {
    const g = google();
    const state = googleStateSchema.parse({ historyId: "10" });
    g.history.mockResolvedValueOnce({
      data: {
        historyId: "20",
        history: Array.from({ length: 45 }, (_, i) => ({
          labelsAdded: [{ message: { id: `m${i}` }, labelIds: ["next"] }],
          labelsRemoved: [{ message: { id: `m${i}` }, labelIds: ["old"] }],
        })),
      },
    });
    await readGoogleCorrections({
      api: g.api,
      state,
      observations: empty(),
      targets,
      now: 100,
    });
    expect(Object.keys(state.queued)).toHaveLength(5);
    const restored = googleStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(
      (
        await readGoogleCorrections({
          api: g.api,
          state: restored,
          observations: empty(),
          targets,
          now: 200,
        })
      ).current,
    ).toHaveLength(5);
    expect(restored.queued).toEqual({});
  });
  it("rebaselines safely when history expires", async () => {
    const g = google();
    g.history.mockRejectedValueOnce({ code: 404 });
    const state = googleStateSchema.parse({ historyId: "1" });
    expect(
      (
        await readGoogleCorrections({
          api: g.api,
          state,
          observations: empty(),
          targets,
          now: 100,
        })
      ).reset,
    ).toBe(true);
    expect(g.get).not.toHaveBeenCalled();
  });
  it("defers a concurrent move whose history has not been read yet", async () => {
    const g = google();
    g.history.mockResolvedValueOnce({
      data: { historyId: "19", history: [moved] },
    });
    const state = googleStateSchema.parse({ historyId: "10" });
    expect(
      (
        await readGoogleCorrections({
          api: g.api,
          state,
          observations: empty(),
          targets,
          now: 100,
        })
      ).current,
    ).toEqual([]);
    expect(state.queued.m).toHaveLength(1);
  });
});

describe("iCloud correction metadata", () => {
  function imap() {
    let selected = "";
    const folders: Record<string, { validity: bigint; uids: number[] }> = {
      Services: { validity: BigInt(1), uids: [1] },
      Purchases: { validity: BigInt(2), uids: [] },
    };
    const release = vi.fn();
    const fetchAll = vi.fn(
      async (uids: number[], _query: unknown, _options: unknown) =>
        uids.map((uid) => ({
          uid,
          envelope: {
            messageId: "<stable@example.test>",
            subject: "Receipt",
            from: [{ address: "sender@example.test" }],
          },
          size: 100,
          internalDate: new Date(1000),
        })),
    );
    const client = {
      list: async () =>
        Object.keys(folders).map((path) => ({ path, flags: new Set() })),
      getMailboxLock: vi.fn(async (path: string) => {
        selected = path;
        return { release };
      }),
      get mailbox() {
        return { uidValidity: folders[selected].validity };
      },
      search: async () => folders[selected].uids,
      fetchAll,
    };
    return {
      folders,
      fetchAll,
      client: client as unknown as ImapFlow,
    };
  }
  it("preserves identity through copy/delete moves and fetches metadata only", async () => {
    const i = imap();
    const state = imapStateSchema.parse({});
    const observations = empty();
    const scan = (now: number) =>
      readICloudCorrections({
        client: i.client,
        state,
        targets: { Services: "Services", Purchases: "Purchases" },
        now,
      });
    const baseline = await scan(100);
    expect(baseline.reset).toBe(true);
    observeChanges(observations, baseline.current, 100, 30);
    i.folders.Purchases.uids = [8];
    const copied = await scan(200);
    expect(copied.current[0].targets).toContain("@ambiguous");
    expect(observeChanges(observations, copied.current, 200, 30)).toEqual([]);
    expect(
      observeChanges(observations, (await scan(300)).current, 300, 30),
    ).toEqual([]);
    i.folders.Services.uids = [];
    observeChanges(observations, (await scan(400)).current, 400, 30);
    const ready = observeChanges(
      observations,
      (await scan(500)).current,
      500,
      30,
    );
    expect(ready[0].before.targets).toEqual(["Services"]);
    expect(ready[0].after.targets).toEqual(["Purchases"]);
    expect(ready[0].before.key).toBe(ready[0].after.key);
    expect(i.fetchAll).toHaveBeenCalledTimes(2);
    expect(i.fetchAll.mock.calls[0][1]).toEqual({
      uid: true,
      envelope: true,
      size: true,
      internalDate: true,
    });
    expect(i.client.getMailboxLock).toHaveBeenCalledWith("Services", {
      readOnly: true,
    });
  });
  it("refreshes cached Inbox flags and fails closed when a flag response is missing", async () => {
    const i = imap();
    const state = imapStateSchema.parse({});
    const scan = () =>
      readICloudCorrections({
        client: i.client,
        state,
        targets: { Services: "@inbox" },
        now: 100,
      });
    const fetchMetadata = i.fetchAll.getMockImplementation()!;
    let flags: Set<string> | undefined = new Set(["\\Seen"]);
    i.fetchAll.mockImplementation(async (uids, query, options) => {
      if ((query as { flags?: boolean }).flags)
        return uids.map((uid) => ({ uid, flags })) as any;
      return fetchMetadata(uids, query, options);
    });
    const first = await scan();
    expect(first.current[0]).toMatchObject({ isRead: true, isFlagged: false });
    flags = new Set(["\\Flagged"]);
    expect((await scan()).current[0]).toMatchObject({
      isRead: false,
      isFlagged: true,
    });
    expect(first.current[0].isRead).toBe(true);
    flags = undefined;
    expect((await scan()).current[0].isRead).toBeUndefined();
  });
  it("resets the baseline after UIDVALIDITY changes", async () => {
    const i = imap();
    const state = imapStateSchema.parse({});
    const scan = () =>
      readICloudCorrections({
        client: i.client,
        state,
        targets: { Services: "Services" },
        now: 100,
      });
    await scan();
    i.folders.Services.validity = BigInt(3);
    expect((await scan()).reset).toBe(true);
  });
});
