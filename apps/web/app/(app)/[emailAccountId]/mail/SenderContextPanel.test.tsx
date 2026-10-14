// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SenderContextPanel } from "./SenderContextPanel";

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SUPPORT_EMAIL: "support@example.com" },
}));

afterEach(cleanup);

describe("SenderContextPanel", () => {
  it("explains why the context couldn't load", async () => {
    const cache = new Map();
    renderPanel(cache, () => Promise.reject(networkError()));

    expect(
      await screen.findByText(/Couldn't connect to Inbox Zero/),
    ).toBeTruthy();
  });

  it("retries on reopen without showing the previous failure", async () => {
    const cache = new Map();
    const { unmount } = renderPanel(cache, () =>
      Promise.reject(networkError()),
    );
    await screen.findByText("Couldn't load public context");
    unmount();

    renderPanel(cache, () => new Promise(() => {}));

    expect(screen.queryByText("Couldn't load public context")).toBeNull();
  });

  it("hides a failed retry's error while retrying again", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        status: "unavailable",
        reason: "research_failed",
      })
      .mockRejectedValueOnce(networkError())
      .mockReturnValue(new Promise(() => {}));
    renderPanel(new Map(), fetcher);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText("Couldn't load public context");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() =>
      expect(screen.queryByText("Couldn't load public context")).toBeNull(),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["the request fails", () => Promise.reject(networkError())],
    [
      "the research fails",
      () =>
        Promise.resolve({ status: "unavailable", reason: "research_failed" }),
    ],
  ])("researches again from Try again when %s", async (_, firstAttempt) => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(firstAttempt)
      .mockResolvedValue({ status: "unavailable", reason: "not_found" });
    renderPanel(new Map(), fetcher);

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(
      await screen.findByText(
        "No confident public professional profile was found.",
      ),
    ).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

function renderPanel(cache: Map<unknown, unknown>, fetcher: () => unknown) {
  return render(
    <SWRConfig value={{ fetcher, provider: () => cache, dedupingInterval: 0 }}>
      <SenderContextPanel
        messageId="message-1"
        onClose={() => {}}
        senderEmail="sender@example.com"
        senderName="Sender"
        variant="inline"
      />
    </SWRConfig>,
  );
}

function networkError() {
  const message =
    "Couldn't connect to Inbox Zero. Check your internet connection and try again.";
  return Object.assign(new Error(message), { info: { error: message } });
}
