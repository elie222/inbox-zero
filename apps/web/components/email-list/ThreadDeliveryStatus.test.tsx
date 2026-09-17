// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { cancelScheduledEmailAction } from "@/utils/actions/scheduled-email";
import { ThreadDeliveryStatus } from "./ThreadDeliveryStatus";

vi.mock("@/utils/email-cache/database", () => ({
  getEmailCacheDatabase: async () => undefined,
}));
vi.mock("@/utils/email-cache/mail-mutations", () => ({
  subscribeToMailMutations: () => () => {},
}));
vi.mock("@/utils/email-cache/reply-drafts", () => ({
  restoreReplyFromOutbox: vi.fn(),
}));
vi.mock("@/utils/actions/scheduled-email", () => ({
  cancelScheduledEmailAction: vi.fn(),
  cancelEmailReminderAction: vi.fn(),
  retryScheduledEmailAction: vi.fn(),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ userEmail: "user@example.com" }),
}));
vi.mock("./EmailMessage", () => ({ EmailMessage: () => null }));

describe("offline scheduled delivery status", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => {
    cleanup();
    setOnline(true);
  });

  it("keeps scheduled status unknown without fetching while offline", async () => {
    setOnline(false);
    const fetcher = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    renderStatus(fetcher);
    await waitFor(() =>
      expect(
        screen.getByText(/scheduled reply status is unavailable/i),
      ).toBeTruthy(),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps last-known scheduled rows when going offline and disables server actions", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      scheduledEmails: [
        {
          id: "scheduled-1",
          status: "PENDING",
          sendAt: "2027-01-01T12:00:00Z",
          reminderStatus: "NONE",
        },
      ],
    });
    renderStatus(fetcher);
    await screen.findByText(/Scheduled for/);
    act(() => setOnline(false));
    expect(screen.getByText(/Scheduled for/)).toBeTruthy();
    expect(screen.getByText(/last known scheduled reply status/i)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Cancel send" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("loads the current scheduled status after reconnecting", async () => {
    setOnline(false);
    const fetcher = vi.fn().mockResolvedValue({ scheduledEmails: [] });
    renderStatus(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    act(() => setOnline(true));
    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(
      screen.queryByText(/scheduled reply status is unavailable/i),
    ).toBeNull();
  });

  it("offers retry after a network failure even when the browser claims to be online", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Fetch failed"))
      .mockResolvedValue({ scheduledEmails: [] });
    renderStatus(fetcher);
    expect(
      await screen.findByText("Scheduled reply status is unavailable."),
    ).toBeTruthy();
    expect(navigator.onLine).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry scheduled status" }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByText("Scheduled reply status is unavailable."),
      ).toBeNull(),
    );
  });

  it("keeps failed delivery actions visible as errors", async () => {
    vi.mocked(cancelScheduledEmailAction).mockRejectedValueOnce(
      new Error("Could not cancel send."),
    );
    renderStatus(
      vi.fn().mockResolvedValue({
        scheduledEmails: [
          {
            id: "scheduled-1",
            status: "PENDING",
            sendAt: "2027-01-01T12:00:00Z",
            reminderStatus: "NONE",
          },
        ],
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Cancel send" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not cancel send.",
    );
  });
});

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
  window.dispatchEvent(new Event(online ? "online" : "offline"));
}
function renderStatus(fetcher: () => Promise<unknown>) {
  return render(
    <SWRConfig
      value={{ provider: () => new Map(), fetcher, shouldRetryOnError: false }}
    >
      <ThreadDeliveryStatus
        emailAccountId="account-1"
        threadId="thread-1"
        messageIds={[]}
        onEditReply={vi.fn()}
        refetch={vi.fn()}
        canEditReply
      />
    </SWRConfig>,
  );
}
