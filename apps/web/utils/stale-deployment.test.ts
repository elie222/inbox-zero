// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NEXT_ACTION_NOT_FOUND_HEADER } from "next/dist/client/components/app-router-headers";
import { toast } from "sonner";
import { registerOpenComposer, runPendingReloads } from "./safe-reload";
import {
  claimStaleDeploymentReload,
  installStaleDeploymentReload,
} from "./stale-deployment";

describe("claimStaleDeploymentReload", () => {
  it("reloads once and not again while the reloaded page is still stale", () => {
    const storage = createStorage();
    const deployNoticedAt = 1_000_000;

    expect(claimStaleDeploymentReload(storage, deployNoticedAt)).toBe(true);
    expect(claimStaleDeploymentReload(storage, deployNoticedAt + 2000)).toBe(
      false,
    );
    expect(
      claimStaleDeploymentReload(storage, deployNoticedAt + 4 * 60 * 1000),
    ).toBe(false);
  });

  it("reloads again for a later deploy once the cooldown has passed", () => {
    const storage = createStorage();
    const firstDeployAt = 1_000_000;

    claimStaleDeploymentReload(storage, firstDeployAt);

    expect(
      claimStaleDeploymentReload(storage, firstDeployAt + 24 * 60 * 60 * 1000),
    ).toBe(true);
  });
});

vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("stale action response", () => {
  it.each([
    false,
    true,
  ])("preserves the failed response and reloads safely (compose open: %s)", async (composeOpen) => {
    const response = new Response("Action not found", {
      status: 404,
      headers: { [NEXT_ACTION_NOT_FOUND_HEADER]: "1" },
    });
    const reload = vi.fn();
    vi.stubGlobal("window", {
      fetch: vi.fn().mockResolvedValue(response),
      location: { reload },
      sessionStorage: createStorage(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const close = composeOpen ? registerOpenComposer() : () => {};
    installStaleDeploymentReload();
    expect(await window.fetch("/action")).toBe(response);
    expect(toast.info).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(composeOpen ? 0 : 1);
    if (composeOpen) expect(toast.error).toHaveBeenCalled();
    close();
    runPendingReloads();
    expect(reload).toHaveBeenCalledTimes(1);
    await window.fetch("/action");
    expect(toast.error).toHaveBeenCalled();
    runPendingReloads();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("leaves ordinary responses alone", async () => {
    const response = new Response("ok");
    const reload = vi.fn();
    vi.stubGlobal("window", {
      fetch: vi.fn().mockResolvedValue(response),
      location: { reload },
    });
    installStaleDeploymentReload();
    expect(await window.fetch("/action")).toBe(response);
    expect(reload).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
