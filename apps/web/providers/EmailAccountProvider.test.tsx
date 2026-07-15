// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmailAccountPreviewProvider,
  useAccount,
} from "./EmailAccountProvider";

vi.mock("next/navigation", () => ({
  useParams: () => ({}),
}));

vi.mock("@/utils/actions/email-account-cookie", () => ({
  setLastEmailAccountAction: vi.fn(),
}));

describe("EmailAccountProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("supports account-free previews without requesting user accounts", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmailAccountPreviewProvider>
        <AccountState />
      </EmailAccountPreviewProvider>,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("ready without an account")).toBeTruthy();
  });
});

function AccountState() {
  const { emailAccountId, isLoading } = useAccount();

  return (
    <span>
      {isLoading
        ? "loading"
        : `ready ${emailAccountId ? "with" : "without"} an account`}
    </span>
  );
}
