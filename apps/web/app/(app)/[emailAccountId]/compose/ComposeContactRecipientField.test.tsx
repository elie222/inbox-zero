// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import { env } from "@/env";
import { ComposeContactRecipientField } from "./ComposeContactRecipientField";

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_CONTACTS_ENABLED: false } }));
const local = vi.fn();
const api = vi.fn();
const pending = vi.fn();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  local.mockResolvedValue([
    { name: "Jane Local", emailAddress: "jane@example.com" },
  ]);
  api.mockResolvedValue({
    contacts: [
      { name: "Jane API", emailAddress: "JANE@example.com" },
      { name: "Janet API", emailAddress: "janet@example.com" },
    ],
  });
});

describe("compose contact suggestions", () => {
  it("suggests and selects local recipients with contacts disabled, without an API call", async () => {
    env.NEXT_PUBLIC_CONTACTS_ENABLED = false;
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "To" }), {
      target: { value: "jan" },
    });
    fireEvent.mouseDown(
      await screen.findByRole("option", { name: /Jane Local/ }),
      { button: 0 },
    );
    expect(
      await screen.findByRole("button", { name: "Remove jane@example.com" }),
    ).toBeTruthy();
    expect(api).not.toHaveBeenCalled();
    expect(local).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "send-account",
        ownAddresses: ["me@example.com"],
        query: "jan",
      }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "To" }), {
      target: { value: "jan" },
    });
    await waitFor(() => expect(local).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("option", { name: /Jane Local/ })).toBeNull();
  });

  it("merges API and local results with the flag on", async () => {
    env.NEXT_PUBLIC_CONTACTS_ENABLED = true;
    render(<Harness />);
    fireEvent.change(screen.getByRole("combobox", { name: "To" }), {
      target: { value: "jan" },
    });
    await screen.findByRole("option", { name: /Janet API/ });
    await screen.findByRole("option", { name: /Jane Local/ });
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("commits pasted recipient lists with names while the contacts flag is off", async () => {
    env.NEXT_PUBLIC_CONTACTS_ENABLED = false;
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "To" });
    fireEvent.change(input, {
      target: { value: '"Doe, Jane" <jane@example.com>, second@example.com' },
    });
    fireEvent.keyUp(input, { key: "Enter" });
    expect(
      await screen.findByRole("button", {
        name: 'Remove "Doe, Jane" <jane@example.com>',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove second@example.com" }),
    ).toBeTruthy();
  });

  it("keeps local suggestions available alongside the API reconnect-required prompt", async () => {
    env.NEXT_PUBLIC_CONTACTS_ENABLED = true;
    render(<Harness reconnectRequired />);
    expect(screen.getByRole("status").textContent).toContain(
      "Reconnect this account",
    );
    fireEvent.change(screen.getByRole("combobox", { name: "To" }), {
      target: { value: "jan" },
    });
    await screen.findByRole("option", { name: /Jane Local/ });
    expect(api).not.toHaveBeenCalled();
  });

  it("discards stale queries and still accepts free-typed recipients when unavailable", async () => {
    env.NEXT_PUBLIC_CONTACTS_ENABLED = false;
    let resolveOld: (value: unknown) => void = () => {};
    local.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "To" });
    fireEvent.change(input, { target: { value: "old" } });
    await waitFor(() => expect(local).toHaveBeenCalledTimes(1));
    local.mockRejectedValue(new Error("unavailable"));
    fireEvent.change(input, { target: { value: "manual@example.com" } });
    await waitFor(() => expect(local).toHaveBeenCalledTimes(2));
    resolveOld([{ name: "Old", emailAddress: "old@example.com" }]);
    fireEvent.keyUp(input, { key: "Enter" });
    expect(
      await screen.findByRole("button", { name: "Remove manual@example.com" }),
    ).toBeTruthy();
    expect(screen.queryByRole("option")).toBeNull();
  });
});

function Harness({
  reconnectRequired = false,
}: {
  reconnectRequired?: boolean;
}) {
  const [recipients, setRecipients] = useState("");
  return (
    <SWRConfig value={{ provider: () => new Map(), fetcher: api }}>
      <MailEngineProvider
        client={{ queryContactSuggestions: local } as unknown as MailClient}
      >
        <ComposeContactRecipientField
          active
          emailAccountId="send-account"
          ownAddresses={["me@example.com"]}
          name="to"
          isReconnectingContacts={false}
          reconnectRequired={reconnectRequired}
          selectedRecipients={recipients}
          onActivate={vi.fn()}
          onReconnectContacts={vi.fn()}
          onReconnectRequired={vi.fn()}
          onSearchQueryChange={pending}
          onSelectedRecipientsChange={(_, value) => setRecipients(value)}
        />
      </MailEngineProvider>
    </SWRConfig>
  );
}
