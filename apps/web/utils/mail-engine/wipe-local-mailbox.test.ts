import { afterEach, describe, expect, it, vi } from "vitest";
import { wipeLocalMailbox } from "./wipe-local-mailbox";

const desktop = vi.hoisted(() => ({
  wipeMailbox: vi.fn(),
  app: undefined as { wipeMailbox?: () => Promise<void> } | undefined,
}));
const opfs = vi.hoisted(() => ({ wipe: vi.fn() }));

vi.mock("@/utils/desktop-app", () => ({
  getInboxZeroDesktopApp: () => desktop.app,
}));
vi.mock("@/utils/mail-engine/wasm-sqlite", () => ({
  wipeOpfsMailEngine: () => opfs.wipe(),
}));

describe("wipeLocalMailbox", () => {
  afterEach(() => {
    desktop.app = undefined;
    desktop.wipeMailbox.mockReset();
    opfs.wipe.mockReset();
  });

  it("asks the desktop host to wipe native sqlite", async () => {
    desktop.wipeMailbox.mockResolvedValue(undefined);
    desktop.app = { wipeMailbox: desktop.wipeMailbox };
    await wipeLocalMailbox();
    expect(desktop.wipeMailbox).toHaveBeenCalledTimes(1);
    expect(opfs.wipe).not.toHaveBeenCalled();
  });

  it("wipes the OPFS mailbox in the browser", async () => {
    opfs.wipe.mockResolvedValue(undefined);
    await wipeLocalMailbox();
    expect(opfs.wipe).toHaveBeenCalledTimes(1);
    expect(desktop.wipeMailbox).not.toHaveBeenCalled();
  });
});
