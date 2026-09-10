// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";
import { useMailSettings } from "./useMailSettings";

const settings: MailSettingsResponse = {
  layout: "LIST",
  expandedPreview: false,
  splits: [
    {
      id: "split-1",
      name: "Unread",
      order: 0,
      matchAll: true,
      filters: [{ kind: "UNREAD", value: null }],
    },
  ],
};

afterEach(cleanup);

describe("useMailSettings", () => {
  it.each([
    { kind: "LABEL", value: "label-1" },
    { kind: "LABEL", values: ["label-1"] },
    { matchAll: true, filters: null },
    { matchAll: true, filters: [null] },
  ])("withholds incompatible cached settings until revalidation: %j", async (split) => {
    const response = Promise.withResolvers<MailSettingsResponse>();
    const fetcher = vi.fn(() => response.promise);
    const cache = new Map();
    const { result } = renderHook(
      () => ({ settings: useMailSettings(), hydrate: useSWRConfig().mutate }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <SWRConfig
            value={{
              provider: () => cache,
              fetcher,
            }}
          >
            {children}
          </SWRConfig>
        ),
      },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    await act(async () => {
      await result.current.hydrate(
        "/api/mail/settings",
        {
          ...settings,
          splits: [{ id: "split-1", name: "Saved", order: 0, ...split }],
        },
        { revalidate: false },
      );
    });
    expect(result.current.settings.data).toBeUndefined();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await act(async () => response.resolve(settings));
    await waitFor(() => expect(result.current.settings.data).toEqual(settings));

    await act(async () => {
      await result.current.settings.mutate(
        { ...settings, expandedPreview: true },
        { revalidate: false },
      );
    });
    expect(result.current.settings.data?.expandedPreview).toBe(true);
  });
});
