// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EmailAccountProvider,
  EmailAccountPreviewProvider,
  useAccount,
} from "./EmailAccountProvider";
import {
  fetchEmailAccounts,
  resetEmailAccountsInflight,
} from "@/utils/fetch-email-accounts";

const navigation = vi.hoisted(() => ({
  emailAccountId: undefined as string | undefined,
  replace: vi.fn(),
}));
const cookie = vi.hoisted(() => ({ setLastAccount: vi.fn() }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ emailAccountId: navigation.emailAccountId }),
  useRouter: () => ({ replace: navigation.replace }),
}));

vi.mock("@/utils/actions/email-account-cookie", () => ({
  setLastEmailAccountAction: cookie.setLastAccount,
}));

describe("EmailAccountProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailAccountsInflight();
    navigation.emailAccountId = undefined;
    cookie.setLastAccount.mockResolvedValue(undefined);
    window.history.replaceState(null, "", "/settings");
  });

  afterEach(() => {
    cleanup();
    resetEmailAccountsInflight();
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
    expect(screen.getByTestId("account-id").textContent).toBe("account-1");
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

  it("does not rewrite the last-account cookie for a deleted route account", async () => {
    navigation.emailAccountId = "deleted-account";
    window.history.replaceState(null, "", "/deleted-account/mail");
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
    expect(screen.getByTestId("account-id").textContent).toBe("account-1");
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith("/account-1/mail"),
    );
  });

  it("does not replace an owned account route", async () => {
    navigation.emailAccountId = "account-1";
    window.history.replaceState(null, "", "/account-1/mail");
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
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("replaces a deleted account route after the account list refreshes", async () => {
    navigation.emailAccountId = "account-2";
    window.history.replaceState(null, "", "/account-2/mail");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => accountResponse("account-2"),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            emailAccounts: [accountResponse("account-1").emailAccounts[0]],
            lastEmailAccountId: null,
          }),
        }),
    );

    render(
      <EmailAccountProvider>
        <AccountState />
      </EmailAccountProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("account-id").textContent).toBe("account-2"),
    );
    expect(navigation.replace).not.toHaveBeenCalled();

    await fetchEmailAccounts();

    await waitFor(() =>
      expect(screen.getByTestId("account-id").textContent).toBe("account-1"),
    );
    expect(navigation.replace).toHaveBeenCalledWith("/account-1/mail");
  });

  it("does not replace a global route when remaining accounts exist", async () => {
    navigation.emailAccountId = "deleted-account";
    window.history.replaceState(null, "", "/accounts");
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
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it("does not replace a deleted account route when no accounts remain", async () => {
    navigation.emailAccountId = "deleted-account";
    window.history.replaceState(null, "", "/deleted-account/mail");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ emailAccounts: [], lastEmailAccountId: null }),
      }),
    );

    render(
      <EmailAccountProvider>
        <AccountState />
      </EmailAccountProvider>,
    );

    await screen.findByText("ready without an account");
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

function AccountState() {
  const { emailAccountId, isLoading } = useAccount();

  return (
    <span>
      {isLoading
        ? "loading"
        : `ready ${emailAccountId ? "with" : "without"} an account`}
      <span data-testid="account-id">{emailAccountId}</span>
    </span>
  );
}

function accountResponse(lastEmailAccountId: string | null) {
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
