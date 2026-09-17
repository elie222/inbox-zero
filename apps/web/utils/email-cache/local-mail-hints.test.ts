// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { isMailSyncActivated } from "./mail-activation";
import { startLocalMailHints } from "./local-mail-hints";
import {
  readLocalMailSettings,
  writeLocalMailSettings,
} from "./local-mail-settings";

vi.mock("@/utils/desktop-app", () => ({ getInboxZeroDesktopApp: vi.fn() }));
vi.mock("./mail-activation", () => ({ isMailSyncActivated: vi.fn() }));

let connections: FakeSource[];
let dispose: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.clearAllMocks();
  connections = [];
  vi.mocked(isMailSyncActivated).mockReturnValue(true);
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("EventSource", FakeSource);
});
afterEach(() => {
  dispose?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("creates no connection for assistant-only accounts", () => {
  vi.mocked(isMailSyncActivated).mockReturnValue(false);
  dispose = startLocalMailHints("account", vi.fn());
  expect(connections).toHaveLength(0);
});

it("closes a live stream when push is paused and reconnects when enabled", () => {
  dispose = startLocalMailHints("account", vi.fn());
  writeLocalMailSettings({ ...readLocalMailSettings(), pushEnabled: false });
  expect(connections[0].close).toHaveBeenCalled();
  expect(connections).toHaveLength(1);
  writeLocalMailSettings({ ...readLocalMailSettings(), pushEnabled: true });
  expect(connections).toHaveLength(2);
});

it("catches up after readiness and coalesces bursts without trusting payload cursors", async () => {
  const changed = vi.fn();
  dispose = startLocalMailHints("account", changed);
  const connection = connections[0];
  connection.dispatchEvent(new Event("ready"));
  for (let i = 0; i < 20; i++)
    connection.dispatchEvent(
      new MessageEvent("mailbox-change", { data: "untrusted" }),
    );
  await vi.advanceTimersByTimeAsync(100);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(changed).toHaveBeenCalledWith();
  dispose();
  connection.dispatchEvent(new Event("ready"));
  await vi.advanceTimersByTimeAsync(100_000);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(connections).toHaveLength(1);
  expect(connection.close).toHaveBeenCalled();
});

it("reconnects a stalled stream and catches up without requiring a hint", async () => {
  const changed = vi.fn();
  dispose = startLocalMailHints("account", changed);
  connections[0].dispatchEvent(new Event("ready"));
  await vi.advanceTimersByTimeAsync(76_500);
  expect(connections).toHaveLength(2);
  expect(connections[0].close).toHaveBeenCalled();
  connections[1].dispatchEvent(new Event("ready"));
  await vi.advanceTimersByTimeAsync(100);
  expect(changed).toHaveBeenCalledTimes(2);
});

it("pauses hidden browser connections and resumes on visibility", () => {
  dispose = startLocalMailHints("account", vi.fn());
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(connections[0].close).toHaveBeenCalled();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  document.dispatchEvent(new Event("visibilitychange"));
  expect(connections).toHaveLength(2);
});

it("keeps hidden desktop sync connected but stops on offline", () => {
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue({ startAuth: vi.fn() });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  dispose = startLocalMailHints("account", vi.fn());
  expect(connections).toHaveLength(1);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  window.dispatchEvent(new Event("offline"));
  expect(connections[0].close).toHaveBeenCalled();
});

class FakeSource extends EventTarget {
  close = vi.fn();
  onerror: (() => void) | null = null;
  constructor() {
    super();
    connections.push(this);
  }
}
