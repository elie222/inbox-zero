import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchEmailAccounts,
  resetEmailAccountsInflight,
} from "./fetch-email-accounts";

const { swrFetcher } = vi.hoisted(() => ({
  swrFetcher: vi.fn(),
}));

vi.mock("@/providers/swr-fetcher", () => ({
  swrFetcher,
}));

describe("fetchEmailAccounts", () => {
  beforeEach(() => {
    resetEmailAccountsInflight();
    swrFetcher.mockReset();
  });

  afterEach(() => {
    resetEmailAccountsInflight();
  });

  it("reuses one in-flight request for concurrent callers", async () => {
    let resolveRequest: (value: { emailAccounts: unknown[] }) => void =
      () => {};
    swrFetcher.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    const first = fetchEmailAccounts();
    const second = fetchEmailAccounts();

    expect(swrFetcher).toHaveBeenCalledTimes(1);

    resolveRequest({ emailAccounts: [] });
    await expect(first).resolves.toEqual({ emailAccounts: [] });
    await expect(second).resolves.toEqual({ emailAccounts: [] });
  });

  it("starts a new request after the previous one settles", async () => {
    swrFetcher
      .mockResolvedValueOnce({ emailAccounts: [{ id: "a" }] })
      .mockResolvedValueOnce({ emailAccounts: [{ id: "b" }] });

    await expect(fetchEmailAccounts()).resolves.toEqual({
      emailAccounts: [{ id: "a" }],
    });
    await expect(fetchEmailAccounts()).resolves.toEqual({
      emailAccounts: [{ id: "b" }],
    });

    expect(swrFetcher).toHaveBeenCalledTimes(2);
  });
});
