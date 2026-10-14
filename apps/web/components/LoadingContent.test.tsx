// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingContent } from "@/components/LoadingContent";
import { swrFetcher } from "@/providers/swr-fetcher";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com" },
}));

describe("LoadingContent in development", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    cleanup();
  });

  it("keeps loading through a transient 404 from a reloading dev server", () => {
    vi.stubEnv("NODE_ENV", "development");

    render(
      <LoadingContent
        error={{ status: 404 }}
        errorComponent={<div>Could not load</div>}
        loading={false}
        loadingComponent={<div>Loading</div>}
      >
        <div>Content</div>
      </LoadingContent>,
    );

    expect(screen.getByText("Loading")).toBeTruthy();
  });

  it("shows a 404 the server sent on purpose", () => {
    vi.stubEnv("NODE_ENV", "development");

    render(
      <LoadingContent
        error={{ info: { error: "Gone", isKnownError: true }, status: 404 }}
        errorComponent={<div>Could not load</div>}
        loading={false}
        loadingComponent={<div>Loading</div>}
      >
        <div>Content</div>
      </LoadingContent>,
    );

    expect(screen.getByText("Could not load")).toBeTruthy();
  });
});

describe("LoadingContent while offline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("says the user is offline instead of showing the raw fetch error", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(
      <LoadingContent error={{ error: "Failed to fetch" }} loading={false}>
        <div>Content</div>
      </LoadingContent>,
    );

    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
  });

  it("says the user is offline even when the caller has its own error screen", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(
      <LoadingContent
        error={{ error: "Failed to fetch" }}
        errorComponent={<div>Could not load</div>}
        loading={false}
      >
        <div>Content</div>
      </LoadingContent>,
    );

    expect(screen.getByText("You're offline")).toBeTruthy();
    expect(screen.queryByText("Could not load")).toBeNull();
  });

  it("shows why the request failed when online but unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const error = await swrFetcher("/api/user/email-account").catch(
      (error: unknown) =>
        error as Parameters<typeof LoadingContent>[0]["error"],
    );
    vi.unstubAllGlobals();

    render(
      <LoadingContent error={error} loading={false}>
        <div>Content</div>
      </LoadingContent>,
    );

    expect(screen.getByText(/Couldn't connect to Inbox Zero/)).toBeTruthy();
  });
});
