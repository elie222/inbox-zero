// @vitest-environment jsdom

import { cleanup, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMailSyncActivated } from "@/utils/email-cache/mail-activation";
import { useMailSyncActivation } from "./use-mail-sync-activation";

describe("mail visit activation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("does not activate accounts during server rendering or route prefetch", () => {
    function PrefetchedMail() {
      useMailSyncActivation({
        emailAccountId: "account-1",
        isAllAccounts: false,
        combinedAccounts: [{ id: "account-2" }],
      });
      return null;
    }
    renderToString(<PrefetchedMail />);
    expect(isMailSyncActivated("account-1")).toBe(false);
    expect(isMailSyncActivated("account-2")).toBe(false);
  });

  it("activates a single account on a committed mail visit and retains it after leaving", () => {
    const { unmount } = renderHook(() =>
      useMailSyncActivation({
        emailAccountId: "account-1",
        isAllAccounts: false,
        combinedAccounts: [{ id: "account-2" }],
      }),
    );
    expect(isMailSyncActivated("account-1")).toBe(true);
    expect(isMailSyncActivated("account-2")).toBe(false);
    unmount();
    expect(isMailSyncActivated("account-1")).toBe(true);
  });

  it("activates only included unified accounts, including accounts loaded after mount", () => {
    const { rerender } = renderHook(
      ({ combinedAccounts }: { combinedAccounts: { id: string }[] }) =>
        useMailSyncActivation({
          emailAccountId: "excluded-account",
          isAllAccounts: true,
          combinedAccounts,
        }),
      { initialProps: { combinedAccounts: [] } },
    );
    expect(isMailSyncActivated("excluded-account")).toBe(false);
    rerender({ combinedAccounts: [{ id: "account-1" }, { id: "account-2" }] });
    expect(isMailSyncActivated("account-1")).toBe(true);
    expect(isMailSyncActivated("account-2")).toBe(true);
    expect(isMailSyncActivated("excluded-account")).toBe(false);
  });
});
