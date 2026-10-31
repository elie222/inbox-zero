import { afterEach, describe, expect, it, vi } from "vitest";
import { wipeLocalMailbox } from "./wipe-local-mailbox";

const desktop = vi.hoisted(() => ({
  wipeMailbox: vi.fn(),
  app: undefined as { wipeMailbox?: () => Promise<void> } | undefined,
}));
const opfs = vi.hoisted(() => ({ wipe: vi.fn() }));
const senderQueue = vi.hoisted(() => ({ clear: vi.fn() }));
const searchHistory = vi.hoisted(() => ({ clear: vi.fn() }));

vi.mock("@/utils/desktop-app", () => ({
  getInboxZeroDesktopApp: () => desktop.app,
}));
vi.mock("@/utils/mail-engine/wasm-sqlite", () => ({
  wipeOpfsMailEngine: () => opfs.wipe(),
}));
vi.mock("@/store/sender-queue", () => ({
  clearStoredSenderQueues: () => senderQueue.clear(),
}));
vi.mock("@/store/mail-search-history", () => ({
  clearRecentSearchHistory: () => searchHistory.clear(),
}));

describe("wipeLocalMailbox", () => {
  afterEach(() => {
    desktop.app = undefined;
    desktop.wipeMailbox.mockReset();
    opfs.wipe.mockReset();
    senderQueue.clear.mockReset();
    searchHistory.clear.mockReset();
  });

  it("asks the desktop host to wipe native sqlite", async () => {
    desktop.wipeMailbox.mockResolvedValue(undefined);
    desktop.app = { wipeMailbox: desktop.wipeMailbox };
    await wipeLocalMailbox();
    expect(senderQueue.clear).toHaveBeenCalledTimes(1);
    expect(searchHistory.clear).toHaveBeenCalledTimes(1);
    expect(desktop.wipeMailbox).toHaveBeenCalledTimes(1);
    expect(opfs.wipe).not.toHaveBeenCalled();
  });

  it("wipes the OPFS mailbox in the browser", async () => {
    opfs.wipe.mockResolvedValue(undefined);
    await wipeLocalMailbox();
    expect(senderQueue.clear).toHaveBeenCalledTimes(1);
    expect(searchHistory.clear).toHaveBeenCalledTimes(1);
    expect(opfs.wipe).toHaveBeenCalledTimes(1);
    expect(desktop.wipeMailbox).not.toHaveBeenCalled();
  });
});
