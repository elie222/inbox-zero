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

describe("useOrganizationMembership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSWR.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });
  });

  it("reports loading while the email account context is still resolving", async () => {
    mockUseAccount.mockReturnValue({ emailAccountId: "", isLoading: true });

    const { useOrganizationMembership } = await import(
      "./useOrganizationMembership"
    );
    const { result } = renderHook(() => useOrganizationMembership());

    expect(mockUseSWR).toHaveBeenCalledWith(null);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("fetches membership once the email account is resolved", async () => {
    mockUseAccount.mockReturnValue({
      emailAccountId: "account-1",
      isLoading: false,
    });
    mockUseSWR.mockReturnValue({
      data: { role: "ADMIN" },
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    const { useOrganizationMembership } = await import(
      "./useOrganizationMembership"
    );
    const { result } = renderHook(() => useOrganizationMembership());

    expect(mockUseSWR).toHaveBeenCalledWith([
      "/api/user/organization-membership",
      "account-1",
    ]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual({ role: "ADMIN" });
  });

  it("is not loading when the context resolved without an email account", async () => {
    mockUseAccount.mockReturnValue({ emailAccountId: "", isLoading: false });

    const { useOrganizationMembership } = await import(
      "./useOrganizationMembership"
    );
    const { result } = renderHook(() => useOrganizationMembership());

    expect(mockUseSWR).toHaveBeenCalledWith(null);
    expect(result.current.isLoading).toBe(false);
  });
});
