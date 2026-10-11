import { describe, expect, it, vi } from "vitest";
import {
  createMailNotificationTracker,
  createMailNotifier,
  newMailFromSyncPage,
} from "./mail-notifications";
import type { SyncPage } from "@inboxzero/mail-core/sync";

describe("mail notifications", () => {
  it("returns individual sender, subject and thread payloads, never a count", () => {
    const track = createMailNotificationTracker(1000);
    expect(
      track(
        payload([
          message(),
          message({ id: "second", from: "ada@example.com", subject: "" }),
        ]),
        1200,
      ),
    ).toEqual([
      {
        emailAccountId: "account",
        id: "message",
        threadId: "thread/?",
        title: "Ada",
        body: "Hello",
      },
      {
        emailAccountId: "account",
        id: "second",
        threadId: "thread/?",
        title: "ada@example.com",
        body: "(no subject)",
      },
    ]);
  });

  it("deduplicates repeated sync results per account across renderer reloads", () => {
    const track = createMailNotificationTracker(1000);
    expect(track(payload([message(), message()]), 1200)).toHaveLength(1);
    expect(track(payload(), 1300)).toEqual([]);
    expect(track({ ...payload(), emailAccountId: "other" }, 1300)).toHaveLength(
      1,
    );
    expect(
      track(
        payload([message(), message({ id: "reply", receivedAt: 1250 })]),
        1300,
      ),
    ).toHaveLength(1);
  });

  it("ignores startup backlog, stale mail, future timestamps and malformed IPC", () => {
    const track = createMailNotificationTracker(1000);
    for (const value of [
      null,
      {},
      { ...payload(), emailAccountId: "../../login" },
      { ...payload(), messages: "bad" },
      payload([null, {}, 42]),
      payload([message({ threadId: "" })]),
      payload([message({ from: 42 })]),
      payload([message({ receivedAt: Number.NaN })]),
      payload([message({ receivedAt: 999 })]),
      payload([message({ receivedAt: 1201 })]),
    ]) {
      expect(track(value, 1200)).toEqual([]);
    }
    expect(track(payload(), 500_000)).toEqual([]);
  });

  it("ignores initial sync pages without an incremental checkpoint", () => {
    const page = syncPage();
    page.from.checkpoint = null;
    expect(newMailFromSyncPage(page).messages).toEqual([]);
  });

  it("extracts only unread inbox mail, excluding self-sent and partial metadata", () => {
    const page = syncPage();
    const patch = page.changes[0];
    if (patch.kind !== "message_patch") throw new Error("missing patch");
    page.changes.push(
      {
        ...patch,
        key: { ...patch.key, messageId: "read" },
        fields: { ...patch.fields, read: true },
      },
      {
        ...patch,
        key: { ...patch.key, messageId: "archive" },
        fields: { ...patch.fields, roles: [] },
      },
      {
        ...patch,
        key: { ...patch.key, messageId: "self" },
        fields: { ...patch.fields, roles: ["inbox", "sent"] },
      },
      {
        ...patch,
        key: { ...patch.key, messageId: "partial" },
        fields: { read: false },
      },
    );
    expect(newMailFromSyncPage(page)).toEqual(payload());
  });

  it("shows one OS notification per message and navigates and focuses the clicked thread", () => {
    const { notify, shown, openWindow } = notifier();
    notify(payload([message(), message({ id: "second" })]), 1200);
    expect(shown).toHaveLength(2);
    expect(shown[0].options).toEqual({ title: "Ada", body: "Hello" });
    shown[0].listeners.get("click")?.();
    expect(openWindow).toHaveBeenCalledWith(
      "https://app.example.com/account/mail?thread-id=thread%2F%3F",
      { navigate: true },
    );
  });

  it("consumes focused arrivals without replaying them when focus is lost", () => {
    let focused = true;
    const { notify, shown } = notifier(() => focused);
    notify(payload(), 1200);
    focused = false;
    notify(payload(), 1300);
    expect(shown).toEqual([]);
    notify(payload([message({ id: "next" })]), 1300);
    expect(shown).toHaveLength(1);
  });
});

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "message",
    threadId: "thread/?",
    receivedAt: 1100,
    from: '"Ada" <ada@example.com>',
    subject: "Hello",
    ...overrides,
  };
}
function payload(messages: unknown[] = [message()]) {
  return { emailAccountId: "account", messages };
}
function syncPage(): SyncPage {
  return {
    session: { accountId: "account", generation: "g1" },
    requestId: "request",
    from: { streamId: "primary", generation: "g1", checkpoint: "old" },
    to: { streamId: "primary", generation: "g1", checkpoint: "new" },
    changes: [
      {
        kind: "message_patch",
        key: { accountId: "account", messageId: "message" },
        reference: {
          provider: "google",
          messageId: "message",
          conversationId: "thread/?",
          version: null,
        },
        fields: {
          read: false,
          roles: ["inbox"],
          receivedAtMs: 1100,
          from: '"Ada" <ada@example.com>',
          subject: "Hello",
        },
      },
    ],
    requiredHydration: [],
    roundComplete: true,
  };
}
function notifier(isFocused = () => false) {
  const shown: {
    options: { title: string; body: string };
    listeners: Map<string, () => void>;
  }[] = [];
  const openWindow = vi.fn();
  const { notify } = createMailNotifier({
    origin: "https://app.example.com",
    startedAt: 1000,
    isFocused,
    isSupported: () => true,
    openWindow,
    createNotification: (options) => {
      const listeners = new Map<string, () => void>();
      return {
        on: (event, listener) => {
          listeners.set(event, listener);
        },
        show: () => {
          shown.push({ options, listeners });
        },
        close: () => {},
      };
    },
  });
  return { notify, shown, openWindow };
}
