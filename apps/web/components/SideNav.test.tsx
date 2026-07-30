/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUseUser } = vi.hoisted(() => ({ mockUseUser: vi.fn() }));

vi.mock("@/hooks/useUser", () => ({ useUser: mockUseUser }));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "email-account-id" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/mail",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

import { getVisibleApps } from "@/utils/apps";

// The rail is rendered from this list, so asserting on it keeps the test
// focused on the gating rule rather than on sidebar markup.
function AppRailNames({ isAdmin }: { isAdmin: boolean }) {
  return (
    <ul>
      {getVisibleApps({ isAdmin }).map((app) => (
        <li key={app.id}>{app.name}</li>
      ))}
    </ul>
  );
}

describe("app rail admin gating", () => {
  beforeEach(() => {
    mockUseUser.mockReset();
  });
  afterEach(cleanup);

  it("offers Admin to an admin", () => {
    render(<AppRailNames isAdmin={true} />);

    expect(screen.getByText("Admin")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
  });

  // Cosmetic only -- /admin and its API are gated server-side regardless --
  // but it is the rule most likely to regress silently.
  it("hides Admin from everyone else", () => {
    render(<AppRailNames isAdmin={false} />);

    expect(screen.queryByText("Admin")).toBeNull();
    expect(screen.getByText("Settings")).toBeTruthy();
  });
});
