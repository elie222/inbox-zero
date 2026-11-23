import { describe, expect, it } from "vitest";
import { bundleInboxThreads } from "./inbox-bundles";
import type { ListThread } from "./types";

const notifications = split("notifications", "Label_notification", true);
const newsletters = split("newsletters", "Label_newsletter", true);
const toReply = split("to-reply", "Label_to_reply", false);
const all = { ...split("all", "", false), filters: [] };
const splitBundlesOnly = {
  bundleSplits: true,
  groupBySender: false,
  userEmail: "me@example.com",
};
const bySender = {
  bundleSplits: true,
  groupBySender: true,
  userEmail: "me@example.com",
  expandedBundleIds: new Set<string>(),
  keepVisible: () => false,
};

describe("bundleInboxThreads", () => {
  it("places each bundle where its newest thread was and keeps other mail in order", () => {
    const { rows, rowBundles } = bundleInboxThreads({
      ...splitBundlesOnly,
      threads: [
        thread("n1", ["Label_notification"]),
        thread("person", []),
        thread("n2", ["Label_notification"]),
        thread("news1", ["Label_newsletter"]),
        thread("news2", ["Label_newsletter"]),
      ],
      splits: [all, notifications, newsletters],
      expandedBundleIds: new Set(),
      keepVisible: () => false,
    });

    expect(rows.map((row) => row.id)).toEqual(["n1", "person", "news1"]);
    expect(rowBundles.get("n1")).toMatchObject({
      kind: "collapsed",
      bundle: { id: "notifications" },
    });
    expect(
      rowBundles.get("news1")?.bundle.threads.map((row) => row.id),
    ).toEqual(["news1", "news2"]);
  });

  it("lists an expanded bundle's threads together at the bundle's position", () => {
    const { rows, rowBundles } = bundleInboxThreads({
      ...splitBundlesOnly,
      threads: [
        thread("person", []),
        thread("n1", ["Label_notification"]),
        thread("other", []),
        thread("n2", ["Label_notification"]),
      ],
      splits: [notifications],
      expandedBundleIds: new Set(["notifications"]),
      keepVisible: () => false,
    });

    expect(rows.map((row) => row.id)).toEqual(["person", "n1", "n2", "other"]);
    expect(rowBundles.get("n1")).toMatchObject({
      kind: "member",
      isFirst: true,
    });
    expect(rowBundles.get("n2")).toMatchObject({
      kind: "member",
      isFirst: false,
    });
  });

  it("keeps threads that need attention out of bundles", () => {
    const { rows, rowBundles } = bundleInboxThreads({
      ...splitBundlesOnly,
      threads: [
        thread("reply", ["Label_notification", "Label_to_reply"]),
        thread("code", ["Label_notification"]),
        thread("starred", ["Label_notification", "STARRED"]),
        thread("n1", ["Label_notification"]),
        thread("n2", ["Label_notification"]),
      ],
      splits: [notifications, toReply],
      expandedBundleIds: new Set(),
      keepVisible: (row) => row.id === "code",
    });

    expect(rows.map((row) => row.id)).toEqual([
      "reply",
      "code",
      "starred",
      "n1",
    ]);
    expect(rowBundles.get("n1")?.bundle.threads).toHaveLength(2);
  });

  it("keeps mail from a sender the user split out of bundles", () => {
    const boss = {
      id: "boss",
      name: "Boss",
      matchAll: true,
      bundleInInbox: false,
      filters: [{ kind: "FROM" as const, value: "boss@example.com" }],
    };
    const { rows } = bundleInboxThreads({
      ...splitBundlesOnly,
      threads: [
        thread("from-boss", ["Label_notification"], "boss@example.com"),
        thread("n1", ["Label_notification"]),
        thread("n2", ["Label_notification"]),
      ],
      splits: [notifications, boss],
      expandedBundleIds: new Set(),
      keepVisible: () => false,
    });

    expect(rows.map((row) => row.id)).toEqual(["from-boss", "n1"]);
  });

  it("never bundles a match-any split that a state condition widens", () => {
    const newsletterOrUnread = {
      ...split("newsletter-or-unread", "Label_newsletter", true),
      matchAll: false,
      filters: [
        { kind: "LABEL" as const, value: "Label_newsletter" },
        { kind: "UNREAD" as const, value: null },
      ],
    };
    const threads = [
      thread("news1", ["Label_newsletter"]),
      thread("unrelated1", ["UNREAD"]),
      thread("news2", ["Label_newsletter"]),
      thread("unrelated2", ["UNREAD"]),
    ];
    const { rows, rowBundles } = bundleInboxThreads({
      ...splitBundlesOnly,
      threads,
      splits: [newsletterOrUnread],
      expandedBundleIds: new Set(),
      keepVisible: () => false,
    });

    expect(rows).toEqual(threads);
    expect(rowBundles.size).toBe(0);
  });

  it("leaves a lone match as an ordinary row", () => {
    const threads = [
      thread("n1", ["Label_notification"]),
      thread("person", []),
    ];
    const { rows, rowBundles } = bundleInboxThreads({
      ...splitBundlesOnly,
      threads,
      splits: [notifications],
      expandedBundleIds: new Set(),
      keepVisible: () => false,
    });

    expect(rows).toEqual(threads);
    expect(rowBundles.size).toBe(0);
  });

  it("groups other mail by sender address rather than display name", () => {
    const { rows, rowBundles } = bundleInboxThreads({
      ...bySender,
      threads: [
        thread("alert1", [], "F5Bot Alerts <Alerts@F5Bot.com>"),
        thread("sumeeth", [], "Rakazo <sumeeth@example.com>"),
        thread("alert2", [], "F5Bot <alerts@f5bot.com>"),
        thread("mercy", [], "Rakazo <mercy@example.com>"),
      ],
      splits: [],
    });

    expect(rows.map((row) => row.id)).toEqual(["alert1", "sumeeth", "mercy"]);
    expect(rowBundles.get("alert1")?.bundle).toMatchObject({
      id: "sender:alerts@f5bot.com",
      kind: "sender",
      name: "F5Bot Alerts",
    });
    expect(
      rowBundles.get("alert1")?.bundle.threads.map((row) => row.id),
    ).toEqual(["alert1", "alert2"]);
  });

  it("keeps threads the user has written in out of sender groups", () => {
    const replied = thread("replied", [], "Dana <dana@example.com>");
    replied.messages.push({
      ...replied.messages[0],
      id: "replied-reply",
      labelIds: ["SENT"],
      headers: { from: "Me <ME@example.com>", to: "dana@example.com" },
    } as (typeof replied.messages)[number]);
    const drafted = thread("drafted", [], "Dana <dana@example.com>");
    drafted.messages.push({
      ...drafted.messages[0],
      id: "drafted-draft",
      labelIds: ["DRAFT"],
      headers: { from: "Me <alias@example.org>", to: "dana@example.com" },
    } as (typeof drafted.messages)[number]);
    const { rows } = bundleInboxThreads({
      ...bySender,
      threads: [
        replied,
        drafted,
        thread("d1", [], "Dana <dana@example.com>"),
        thread("d2", [], "Dana <dana@example.com>"),
      ],
      splits: [],
    });

    expect(rows.map((row) => row.id)).toEqual(["replied", "drafted", "d1"]);
  });

  it("puts mail in a bundled split before grouping the rest by sender", () => {
    const { rows, rowBundles } = bundleInboxThreads({
      ...bySender,
      threads: [
        thread("n1", ["Label_notification"]),
        thread("s1", []),
        thread("n2", ["Label_notification"]),
        thread("s2", []),
      ],
      splits: [notifications],
    });

    expect(rows.map((row) => row.id)).toEqual(["n1", "s1"]);
    expect(rowBundles.get("n1")?.bundle.id).toBe("notifications");
    expect(rowBundles.get("s1")?.bundle.id).toBe("sender:sender@example.com");
  });

  it("treats the split being viewed as neither a bundle nor a protection", () => {
    const work = split("work", "Label_work", false);
    const threads = [
      thread("n1", ["Label_notification"], "alerts@example.com"),
      thread("n2", ["Label_notification"], "alerts@example.com"),
      thread("w1", ["Label_work"], "pat@example.com"),
      thread("w2", ["Label_work"], "pat@example.com"),
    ];

    const inNotifications = bundleInboxThreads({
      ...bySender,
      threads: threads.slice(0, 2),
      splits: [notifications, work],
      viewedSplitId: "notifications",
    });
    expect(inNotifications.rowBundles.get("n1")?.bundle.id).toBe(
      "sender:alerts@example.com",
    );

    const inWork = bundleInboxThreads({
      ...bySender,
      threads: threads.slice(2),
      splits: [notifications, work],
      viewedSplitId: "work",
    });
    expect(inWork.rowBundles.get("w1")?.bundle.id).toBe(
      "sender:pat@example.com",
    );
  });

  it("leaves a sender's only thread as an ordinary row", () => {
    const threads = [
      thread("dana", [], "dana@example.com"),
      thread("alex", [], "alex@example.com"),
    ];
    const { rows, rowBundles } = bundleInboxThreads({
      ...bySender,
      threads,
      splits: [],
    });

    expect(rows).toEqual(threads);
    expect(rowBundles.size).toBe(0);
  });
});

function split(id: string, labelId: string, bundleInInbox: boolean) {
  return {
    id,
    name: id,
    matchAll: true,
    bundleInInbox,
    filters: [{ kind: "LABEL" as const, value: labelId }],
  };
}

let nextTimestamp = 1_767_225_600_000;

/** Each call is older than the last, matching the inbox's newest-first order. */
function thread(id: string, labelIds: string[], from = "sender@example.com") {
  nextTimestamp -= 60_000;
  return {
    id,
    snippet: "",
    messages: [
      {
        id: `${id}-message`,
        threadId: id,
        labelIds: ["INBOX", ...labelIds],
        internalDate: String(nextTimestamp),
        headers: { from, to: "me@example.com" },
      },
    ],
  } as unknown as ListThread;
}
