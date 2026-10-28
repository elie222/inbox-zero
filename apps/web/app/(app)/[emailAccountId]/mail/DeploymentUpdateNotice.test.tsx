// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastInfo } from "@/components/Toast";
import { reloadAtNextSafeMoment } from "@/utils/safe-reload";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice";

vi.mock("@/components/Toast", () => ({ toastInfo: vi.fn() }));
vi.mock("@/utils/safe-reload", () => ({ reloadAtNextSafeMoment: vi.fn() }));

describe("DeploymentUpdateNotice", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_DEPLOYMENT_ID", "dpl_tab");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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
