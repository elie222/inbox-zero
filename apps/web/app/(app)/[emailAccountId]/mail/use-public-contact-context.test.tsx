// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { describe, expect, it, vi } from "vitest";
import { usePublicContactContext } from "./use-public-contact-context";

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

describe("usePublicContactContext", () => {
  it("does not fetch until the sender panel is opened", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: "unavailable",
      reason: "not_found",
    });
    const { rerender } = renderHook(
      ({ enabled }) =>
        usePublicContactContext({ messageId: "message-1", enabled }),
      {
        initialProps: { enabled: false },
        wrapper: createWrapper(fetcher),
      },
    );

    expect(fetcher).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith([
        "/api/user/public-contact-context/message-1",
        "account-1",
      ]),
    );
  });

  it("scopes combined-reader research to the thread's owning account", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      status: "unavailable",
      reason: "not_found",
    });
    renderHook(
      () =>
        usePublicContactContext({
          emailAccountId: "account-2",
          messageId: "message-1",
          enabled: true,
        }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith([
        "/api/user/public-contact-context/message-1",
        "account-2",
      ]),
    );
  });
});

function createWrapper(fetcher: (key: string | [string, string]) => unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ fetcher, provider: () => new Map() }}>
        {children}
      </SWRConfig>
    );
  };
}
