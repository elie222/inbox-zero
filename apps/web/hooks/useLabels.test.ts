// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSWR = vi.fn();
const mockUseAccount = vi.fn();

vi.mock("swr", () => ({
  default: (...args: Parameters<typeof mockUseSWR>) => mockUseSWR(...args),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

describe("useLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSWR.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });
  });

  it("waits for the selected email account before fetching labels", async () => {
    mockUseAccount.mockReturnValue({
      emailAccount: undefined,
      isLoading: true,
      providerRateLimit: null,
    });

    const { useLabels } = await import("./useLabels");
    const { result } = renderHook(() => useLabels());

    expect(mockUseSWR).toHaveBeenCalledWith(null, {
      shouldRetryOnError: false,
    });
    expect(result.current.userLabels).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it("skips label fetches while the provider is rate limited", async () => {
    mockUseAccount.mockReturnValue({
      emailAccount: { id: "account-1" },
      isLoading: false,
      providerRateLimit: {
        provider: "google",
        retryAt: "2026-04-07T10:21:46.688Z",
        source: "google/webhook",
      },
    });

    const { useLabels } = await import("./useLabels");
    const { result } = renderHook(() => useLabels());

    expect(mockUseSWR).toHaveBeenCalledWith(null, {
      shouldRetryOnError: false,
    });
    expect(result.current.userLabels).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("fetches labels once the selected account is clear", async () => {
    mockUseAccount.mockReturnValue({
      emailAccount: { id: "account-1" },
      isLoading: false,
      providerRateLimit: null,
    });
    mockUseSWR.mockReturnValue({
      data: {
        labels: [
          { id: "2", name: "[Later]", type: "user" },
          { id: "1", name: "Clients", type: "user" },
          { id: "3", name: "Inbox", type: "system" },
        ],
      },
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    const { useLabels } = await import("./useLabels");
    const { result } = renderHook(() => useLabels());

    expect(mockUseSWR).toHaveBeenCalledWith("/api/labels", {
      shouldRetryOnError: false,
    });
    expect(result.current.userLabels.map((label) => label.name)).toEqual([
      "Clients",
      "[Later]",
    ]);
  });
});
