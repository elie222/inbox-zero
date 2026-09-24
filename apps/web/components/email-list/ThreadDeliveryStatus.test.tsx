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
import type { MailClient } from "@inboxzero/mail-core/engine";

const { mailClient, restoreDraft } = vi.hoisted(() => ({
  mailClient: { current: null as MailClient | null },
  restoreDraft: vi.fn(),
}));

vi.mock("@inboxzero/mail-react/MailEngineProvider", () => ({
  useOptionalMailClient: () => mailClient.current,
}));
vi.mock("@/utils/mail-engine/reply-drafts", () => ({
  restoreCancelledSendDraft: restoreDraft,
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
  beforeEach(() => {
    setOnline(true);
    mailClient.current = null;
    restoreDraft.mockReset();
    restoreDraft.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    setOnline(true);
  });

  it("shows nothing and does not fetch while offline without a known status", async () => {
    setOnline(false);
    const fetcher = vi.fn().mockRejectedValue(new Error("Network unavailable"));
    renderStatus(fetcher);
    await act(async () => {});
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
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
    expect(
      screen.getByText("Offline. Showing the last known status."),
    ).toBeTruthy();
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
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers a retry when a refresh fails while the browser claims to be online", async () => {
    const scheduled = {
      scheduledEmails: [
        {
          id: "scheduled-1",
          status: "PENDING",
          sendAt: "2027-01-01T12:00:00Z",
          reminderStatus: "NONE",
        },
      ],
    };
    const fetcher = vi.fn().mockResolvedValueOnce(scheduled);
    renderStatus(fetcher);
    await screen.findByText(/Scheduled for/);
    // Let SWR forget the initial request so reconnecting revalidates.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fetcher.mockRejectedValue(new TypeError("Fetch failed"));
    act(() => setOnline(false));
    act(() => setOnline(true));
    expect(
      await screen.findByText(
        "Could not refresh. Showing the last known status.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Scheduled for/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    fetcher.mockResolvedValue(scheduled);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByText("Could not refresh. Showing the last known status."),
      ).toBeNull(),
    );
    expect(screen.getByText(/Scheduled for/)).toBeTruthy();
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

describe("queued engine reply restore", () => {
  beforeEach(() => {
    mailClient.current = null;
    restoreDraft.mockReset();
    restoreDraft.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    setOnline(true);
  });

  it("restores Edit reply through the provider client when the singleton is missing", async () => {
    setOnline(false);
    const client = {
      getDiagnostics: vi.fn(async () => ({
        commands: [
          {
            operationId: "send-1",
            status: "queued",
            kind: "send",
            conversationIds: ["thread-1"],
            messageIds: ["msg_playwright_reply"],
          },
        ],
      })),
      cancelOperation: vi.fn(async () => ({ status: "cancelled" })),
    } as unknown as MailClient;
    mailClient.current = client;
    const onEditReply = vi.fn();
    render(
      <SWRConfig
        value={{
          provider: () => new Map(),
          shouldRetryOnError: false,
          dedupingInterval: 0,
        }}
      >
        <ThreadDeliveryStatus
          emailAccountId="account-1"
          threadId="thread-1"
          messageIds={["msg_playwright_reply"]}
          onEditReply={onEditReply}
          refetch={vi.fn()}
          canEditReply
        />
      </SWRConfig>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit reply" }));

    await waitFor(() =>
      expect(restoreDraft).toHaveBeenCalledWith({
        client,
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "msg_playwright_reply",
        operationId: "send-1",
      }),
    );
    expect(client.cancelOperation).toHaveBeenCalledWith({
      accountId: "account-1",
      operationId: "send-1",
    });
    expect(onEditReply).toHaveBeenCalledWith("msg_playwright_reply", "reply");
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
      value={{
        provider: () => new Map(),
        fetcher,
        shouldRetryOnError: false,
        dedupingInterval: 0,
      }}
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
