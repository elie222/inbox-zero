// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import type { Cache } from "swr";
import { useSWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SWRProvider } from "./SWRProvider";
import { resetSwrPersistenceBlocksForTesting } from "@/utils/swr-persistence";

const accountState = { emailAccountId: "account-a" };

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => accountState,
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

let scopedCache: Cache | undefined;

function CacheProbe() {
  scopedCache = useSWRConfig().cache;
  return null;
}

function snapshotKey(accountId: string) {
  return `inbox-zero:swr:v1:${accountId}`;
}

describe("SWRProvider persisted cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSwrPersistenceBlocksForTesting();
    accountState.emailAccountId = "account-a";
    scopedCache = undefined;
  });

  it("hydrates whitelisted entries into the live cache after mount", async () => {
    window.localStorage.setItem(
      snapshotKey("account-a"),
      JSON.stringify({ "/api/labels": { labels: ["a-label"] } }),
    );

    render(
      <SWRProvider>
        <CacheProbe />
      </SWRProvider>,
    );

    await waitFor(() => {
      expect(scopedCache?.get("/api/labels")?.data).toEqual({
        labels: ["a-label"],
      });
    });
  });

  it("replaces whitelisted entries on account switch instead of leaking them", async () => {
    window.localStorage.setItem(
      snapshotKey("account-a"),
      JSON.stringify({
        "/api/labels": { labels: ["a-label"] },
        "/api/labels/counts": { counts: ["a-counts"] },
      }),
    );
    window.localStorage.setItem(
      snapshotKey("account-b"),
      JSON.stringify({ "/api/labels": { labels: ["b-label"] } }),
    );

    const view = render(
      <SWRProvider>
        <CacheProbe />
      </SWRProvider>,
    );
    await waitFor(() => {
      expect(scopedCache?.get("/api/labels")?.data).toEqual({
        labels: ["a-label"],
      });
    });

    accountState.emailAccountId = "account-b";
    view.rerender(
      <SWRProvider>
        <CacheProbe />
      </SWRProvider>,
    );

    await waitFor(() => {
      expect(scopedCache?.get("/api/labels")?.data).toEqual({
        labels: ["b-label"],
      });
      // account-b has no counts snapshot: account-a's value must be gone.
      expect(scopedCache?.get("/api/labels/counts")?.data).toBeUndefined();
    });
  });

  it("persists the active account's whitelisted entries on pagehide", async () => {
    window.localStorage.setItem(
      snapshotKey("account-a"),
      JSON.stringify({ "/api/labels": { labels: ["a-label"] } }),
    );

    render(
      <SWRProvider>
        <CacheProbe />
      </SWRProvider>,
    );
    await waitFor(() => {
      expect(scopedCache?.get("/api/labels")?.data).toBeDefined();
    });

    window.localStorage.clear();
    window.dispatchEvent(new Event("pagehide"));

    expect(
      JSON.parse(window.localStorage.getItem(snapshotKey("account-a")) ?? "{}"),
    ).toEqual({ "/api/labels": { labels: ["a-label"] } });
  });

  it("stops persisting an account after another tab removes its snapshot", async () => {
    window.localStorage.setItem(
      snapshotKey("account-a"),
      JSON.stringify({ "/api/labels": { labels: ["a-label"] } }),
    );

    render(
      <SWRProvider>
        <CacheProbe />
      </SWRProvider>,
    );
    await waitFor(() => {
      expect(scopedCache?.get("/api/labels")?.data).toBeDefined();
    });

    // Another tab logging out removes the snapshot and fires a storage event.
    window.localStorage.removeItem(snapshotKey("account-a"));
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: snapshotKey("account-a"),
        newValue: null,
      }),
    );
    window.dispatchEvent(new Event("pagehide"));

    expect(window.localStorage.getItem(snapshotKey("account-a"))).toBeNull();
  });
});
