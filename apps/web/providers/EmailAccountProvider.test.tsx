// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmailAccountProvider,
  EmailAccountPreviewProvider,
  useAccount,
} from "./EmailAccountProvider";

const navigation = vi.hoisted(() => ({
  emailAccountId: undefined as string | undefined,
}));
const cookie = vi.hoisted(() => ({ setLastAccount: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ emailAccountId: navigation.emailAccountId }),
}));

vi.mock("@/utils/actions/email-account-cookie", () => ({
  setLastEmailAccountAction: cookie.setLastAccount,
}));

describe("EmailAccountProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.emailAccountId = undefined;
    cookie.setLastAccount.mockResolvedValue(undefined);
  });

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

  it("does not rewrite the last-account cookie when the route already matches", async () => {
    navigation.emailAccountId = "account-1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => accountResponse("account-1"),
      }),
    );

    render(
      <EmailAccountProvider>
        <AccountState />
      </EmailAccountProvider>,
    );

    await screen.findByText("ready with an account");
    expect(cookie.setLastAccount).not.toHaveBeenCalled();
  });

  it("updates the last-account cookie for a different route account", async () => {
    navigation.emailAccountId = "account-2";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => accountResponse("account-1"),
      }),
    );

    render(
      <EmailAccountProvider>
        <AccountState />
      </EmailAccountProvider>,
    );

    await waitFor(() =>
      expect(cookie.setLastAccount).toHaveBeenCalledWith({
        emailAccountId: "account-2",
      }),
    );
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

function accountResponse(lastEmailAccountId: string) {
  return {
    emailAccounts: [
      {
        id: "account-1",
        email: "one@example.com",
        account: { provider: "google" },
        providerRateLimit: null,
      },
      {
        id: "account-2",
        email: "two@example.com",
        account: { provider: "google" },
        providerRateLimit: null,
      },
    ],
    lastEmailAccountId,
  };
}
