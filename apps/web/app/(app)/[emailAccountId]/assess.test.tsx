// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssessUser } from "./assess";

const mocks = vi.hoisted(() => ({
  pathname: "/account-1/onboarding",
  scan: vi.fn(),
  assess: vi.fn().mockResolvedValue({ data: { skipped: true } }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }));
vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: mocks.scan, executeAsync: mocks.assess }),
}));
vi.mock("@/utils/actions/assess", () => ({
  assessAction: vi.fn(),
  analyzeWritingStyleAction: vi.fn(),
}));
vi.mock("@/utils/actions/whitelist", () => ({
  whitelistInboxZeroAction: vi.fn(),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1", provider: "google" }),
}));
vi.mock("@/hooks/useOrgAccess", () => ({
  useOrgAccess: () => ({ isAccountOwner: true }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.pathname = "/account-1/onboarding";
});
afterEach(cleanup);

describe("startup background assessments", () => {
  it("does not put assessment or writing-style scans ahead of onboarding actions", () => {
    render(<AssessUser />);
    expect(mocks.assess).not.toHaveBeenCalled();
    expect(mocks.scan).not.toHaveBeenCalled();
  });

  it("starts the deferred assessments after leaving onboarding", () => {
    const { rerender } = render(<AssessUser />);
    mocks.pathname = "/account-1/mail";
    rerender(<AssessUser />);
    expect(mocks.assess).toHaveBeenCalledOnce();
    expect(mocks.scan).toHaveBeenCalledOnce();
  });
});
