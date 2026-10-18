// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toastInfo } from "@/components/Toast";
import { DeploymentUpdateNotice } from "./DeploymentUpdateNotice";

vi.mock("@/components/Toast", () => ({ toastInfo: vi.fn() }));

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

  it("asks once for a reload after a newer deployment goes live", async () => {
    const fetchMock = stubDeployment("dpl_newer");
    render(<DeploymentUpdateNotice />);

    await waitFor(() => expect(toastInfo).toHaveBeenCalledOnce());
    expect(toastInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ label: "Reload" }),
      }),
    );

    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(toastInfo).toHaveBeenCalledOnce();
  });

  it("stays quiet while the tab runs the live deployment", async () => {
    const fetchMock = stubDeployment("dpl_tab");
    render(<DeploymentUpdateNotice />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(toastInfo).not.toHaveBeenCalled();
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
