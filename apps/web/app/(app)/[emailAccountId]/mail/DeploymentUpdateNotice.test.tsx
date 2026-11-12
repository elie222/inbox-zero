// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastInfo } from "@/components/Toast";
import { reloadAtNextSafeMoment } from "@/utils/safe-reload";
import { claimAutomaticReload } from "@/utils/automatic-reload";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice";

vi.mock("@/components/Toast", () => ({ toastInfo: vi.fn() }));
vi.mock("@/utils/safe-reload", () => ({ reloadAtNextSafeMoment: vi.fn() }));

describe("DeploymentUpdateNotice", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "dpl_tab");
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("reloads quietly at the next safe moment after a newer deployment goes live", async () => {
    const fetchMock = stubDeployment("dpl_newer");
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<DeploymentUpdateNotice />);

    await waitFor(() => expect(reloadAtNextSafeMoment).toHaveBeenCalledOnce());
    expect(toastInfo).not.toHaveBeenCalled();
    vi.mocked(reloadAtNextSafeMoment).mock.calls[0][0]();
    expect(reload).toHaveBeenCalledOnce();

    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(reloadAtNextSafeMoment).toHaveBeenCalledOnce();
  });

  it("does not repeat a deployment reload after loading the same stale page", async () => {
    stubDeployment("dpl_newer");
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    for (let load = 0; load < 2; load++) {
      const view = render(<DeploymentUpdateNotice />);
      await waitFor(() =>
        expect(reloadAtNextSafeMoment).toHaveBeenCalledTimes(load + 1),
      );
      vi.mocked(reloadAtNextSafeMoment).mock.calls[load][0]();
      view.unmount();
    }
    expect(reload).toHaveBeenCalledOnce();
  });

  it("keeps checking after a reload is rejected during the cooldown", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "previous-build");
    expect(claimAutomaticReload()).toBe(true);
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "dpl_tab");
    stubDeployment("dpl_newer");
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    render(<DeploymentUpdateNotice />);
    await waitFor(() => expect(reloadAtNextSafeMoment).toHaveBeenCalledOnce());
    vi.mocked(reloadAtNextSafeMoment).mock.calls[0][0]();
    expect(reload).not.toHaveBeenCalled();
    now.mockReturnValue(1_000_000 + 10 * 60_000);
    window.dispatchEvent(new Event("focus"));
    await waitFor(() =>
      expect(reloadAtNextSafeMoment).toHaveBeenCalledTimes(2),
    );
    vi.mocked(reloadAtNextSafeMoment).mock.calls[1][0]();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("stays quiet while the tab runs the live deployment", async () => {
    const fetchMock = stubDeployment("dpl_tab");
    render(<DeploymentUpdateNotice />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(reloadAtNextSafeMoment).not.toHaveBeenCalled();
  });

  it("does not check when the build has no deployment id", () => {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "");
    const fetchMock = stubDeployment("dpl_newer");
    render(<DeploymentUpdateNotice />);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function stubDeployment(deploymentId: string) {
  const fetchMock = vi.fn(async () => Response.json({ deploymentId }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
