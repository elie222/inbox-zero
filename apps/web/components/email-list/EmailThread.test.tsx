// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadMessage } from "@/components/email-list/types";
import {
  rememberReplacedDraftMessage,
  type StoredReplyDraft,
} from "@/utils/mail-engine/reply-drafts";
import {
  EmailThread,
  organizeThreadMessages,
} from "@/components/email-list/EmailThread";
import { hideSendingDraftMessages } from "@/hooks/useHiddenDraftMessageIds";

class MockResizeObserver {
  observe() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", MockResizeObserver);

const { discardDraft } = vi.hoisted(() => ({ discardDraft: vi.fn() }));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: discardDraft }),
}));
const { scheduledEmails } = vi.hoisted(() => ({
  scheduledEmails: {
    current: [] as { status: string; draftMessageIds: string[] }[],
  },
}));
vi.mock("swr", () => ({
  default: (key: unknown) => ({
    data:
      Array.isArray(key) && key[0] === "/api/user/scheduled-emails"
        ? { scheduledEmails: scheduledEmails.current }
        : undefined,
  }),
}));
vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({
    emailAccount: undefined,
    emailAccountId: "account-1",
    userEmail: "user@example.com",
  }),
}));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_CONTACTS_ENABLED: false } }));
vi.mock("@/components/Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
}));
const { htmlBodyReady } = vi.hoisted(() => ({
  htmlBodyReady: { current: true },
}));
vi.mock("@/components/email-list/EmailContents", () => ({
  HtmlEmail: () => <div data-email-ready={htmlBodyReady.current} />,
  PlainEmail: () => <div data-testid="message-body" />,
}));
vi.mock("@/components/email-list/EmailAttachments", () => ({
  EmailAttachments: () => null,
}));
vi.mock("@/components/email-list/EmailDetails", () => ({
  EmailDetails: () => null,
}));
vi.mock("@/components/email-list/ThreadDeliveryStatus", () => ({
  ThreadDeliveryStatus: () => null,
}));
vi.mock("@/components/email-list/OpenedConversationAttachments", () => ({
  OpenedConversationAttachments: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
}));
const { localDrafts } = vi.hoisted(() => ({
  localDrafts: { current: [] as StoredReplyDraft[], isLoading: false },
}));

vi.mock("@/hooks/useReplyDrafts", () => ({
  useReplyDrafts: (
    _accountId: string,
    _threadId: string,
    messageIds: string[],
  ) => ({
    drafts: localDrafts.current.filter((draft) =>
      messageIds.some(
        (id) =>
          draft.messageId === `${id}:reply` ||
          draft.messageId === `${id}:forward`,
      ),
    ),
    isLoading: localDrafts.isLoading,
  }),
}));
vi.mock("@/hooks/useSentMessageOpens", () => ({
  useSentMessageOpens: () => ({ data: undefined }),
}));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));
vi.mock("@/utils/actions/mail", () => ({ deleteDraftAction: vi.fn() }));
vi.mock("@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy", () => ({
  ComposeEmailFormLazy: MockComposer,
}));

let composerMounts = 0;

describe("EmailThread reply composer", () => {
  afterEach(cleanup);

  // A sync can append a newer message while a reply is open on what was the
  // latest one; the reply must stay on screen rather than collapse away.
  it("keeps an open reply visible when a newer message arrives", () => {
    const first = createReaderMessage("first", "1000");
    const view = render(
      <EmailThread messages={[first]} refetch={vi.fn()} showReplyButton />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByRole("textbox", { name: "Email message" })).toBeTruthy();

    view.rerender(
      <EmailThread
        messages={[first, createReaderMessage("second", "2000")]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    expect(screen.getByRole("textbox", { name: "Email message" })).toBeTruthy();

    view.rerender(
      <EmailThread
        messages={[
          first,
          createReaderMessage("second", "2000"),
          createReaderDraft("other-copy", "3000"),
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    expect(
      screen
        .getAllByRole("textbox", { name: "Email message" })
        .map((editor) => editor.dataset.draftSessionId),
    ).toEqual(["first:reply", "other-copy:reply"]);

    view.rerender(
      <EmailThread
        messages={[
          {
            ...createReaderMessage("other-parent", "1000"),
            threadId: "thread-2",
          },
          { ...createReaderDraft("other-draft", "2000"), threadId: "thread-2" },
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    expect(
      screen.getByRole("textbox", { name: "Email message" }).dataset
        .draftSessionId,
    ).toBe("other-draft:reply");
  });

  it("keeps independent mailbox drafts open while composing and closing a forward", () => {
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createReaderDraft("independent-first", "2000"),
          createReaderDraft("independent-second", "3000"),
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    const editors = () =>
      screen.getAllByRole("textbox", { name: "Email message" });
    fireEvent.change(editors()[0], { target: { value: "Independent edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(editors().map((editor) => editor.dataset.draftSessionId)).toEqual([
      "independent-first:reply",
      "independent-second:reply",
      "parent:forward",
    ]);
    expect((editors()[0] as HTMLInputElement).value).toBe("Independent edit");
    fireEvent.click(screen.getAllByRole("button", { name: "Send" })[2]);
    expect(editors()).toHaveLength(2);
    expect((editors()[0] as HTMLInputElement).value).toBe("Independent edit");
  });

  // Gmail gives a draft a new message ID each time it is saved. When sync
  // brings that replacement in, the draft being edited must keep its composer
  // and local draft instead of reopening as a different, unloaded draft.
  it("keeps editing a saved draft after Gmail replaces its message", () => {
    composerMounts = 0;
    const parent = createReaderMessage("parent", "1000");
    const draftV1 = createReaderDraft("draft-v1", "2000");
    const view = render(
      <EmailThread
        messages={[parent, draftV1]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    const composer = screen.getByRole("textbox", { name: "Email message" });
    expect(composer.dataset.draftSessionId).toBe("draft-v1:reply");

    rememberReplacedDraftMessage("account-1", "draft-v1", "draft-v2");
    for (const messages of [
      [parent, createReaderDraft("draft-v2", "2000"), draftV1],
      [parent, createReaderDraft("draft-v2", "3000")],
    ]) {
      view.rerender(
        <EmailThread
          messages={messages}
          missingBodyIds={new Set(["draft-v2"])}
          refetch={vi.fn()}
          showReplyButton
        />,
      );

      expect(screen.queryByText("Loading message…")).toBeNull();
      const current = screen.getByRole("textbox", { name: "Email message" });
      expect(current.dataset.draftSessionId).toBe("draft-v1:reply");
      expect(current.dataset.providerDraftMessageId).toBe("draft-v2");
      expect(composerMounts).toBe(1);
    }
    view.rerender(
      <EmailThread
        messages={[parent, createReaderDraft("draft-v2", "3000")]}
        autoOpenForwardForMessageId="parent"
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    expect(
      screen.getAllByRole("textbox", { name: "Email message" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("textbox", { name: "Email message" })[1].dataset
        .draftSessionId,
    ).toBe("parent:forward");
    view.rerender(
      <EmailThread
        messages={[parent, createReaderDraft("draft-v2", "3000")]}
        autoOpenReplyForMessageId="parent"
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    expect(
      screen.getAllByRole("textbox", { name: "Email message" }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: "Email message" }).dataset
        .draftSessionId,
    ).toBe("draft-v1:reply");
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(
      screen.getAllByRole("textbox", { name: "Email message" }),
    ).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(
      screen.getAllByRole("textbox", { name: "Email message" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("textbox", { name: "Email message" })[1].dataset
        .draftSessionId,
    ).toBe("parent:forward");
  });
});

describe("EmailThread outgoing replies", () => {
  afterEach(cleanup);

  // A queued reply shows in the thread as soon as the composer closes, and the
  // provider's copy takes over the same row so its body does not reload.
  it("shows a queued reply as sent until its sent message takes over the same row", () => {
    const parent = createReaderMessage("parent", "1000");
    const view = render(
      <EmailThread
        messages={[parent]}
        outgoing={[
          {
            operationId: "send-1",
            status: "verifying",
            message: createSentMessage("outgoing:send-1", "3000"),
          },
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    const outgoingRow = view.container.querySelector(
      '[data-thread-message-id="outgoing:send-1"]',
    );
    expect(outgoingRow?.querySelector("time")).toBeTruthy();
    expect(outgoingRow?.textContent).not.toContain("Sending");
    expect(screen.getAllByRole("button", { name: "Reply" })).toHaveLength(2);

    view.rerender(
      <EmailThread
        messages={[parent, createSentMessage("sent-1", "4000")]}
        sendOperationIds={new Map([["sent-1", "send-1"]])}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    const sentRow = view.container.querySelector(
      '[data-thread-message-id="sent-1"]',
    );
    expect(sentRow).toBe(outgoingRow);
  });

  // The sent reply becomes the newest message, so selection follows it there,
  // while the message it answered stays open instead of collapsing.
  it("moves selection to a sent reply and keeps the replied-to message open", () => {
    const parent = createReaderMessage("parent", "1000");
    const view = render(
      <EmailThread
        enableMessageNavigation
        messages={[parent]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    view.rerender(
      <EmailThread
        enableMessageNavigation
        messages={[parent]}
        outgoing={[
          {
            operationId: "send-1",
            status: "verifying",
            message: createSentMessage("outgoing:send-1", "3000"),
          },
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    const parentRow = view.container.querySelector<HTMLElement>(
      '[data-thread-message-id="parent"]',
    );
    const sentRow = view.container.querySelector<HTMLElement>(
      '[data-thread-message-id="outgoing:send-1"]',
    );
    expect(
      parentRow?.querySelector('[data-testid="message-body"]'),
    ).toBeTruthy();
    expect(parentRow?.dataset.selected).toBe("false");
    expect(sentRow?.dataset.selected).toBe("true");
  });

  // Closing the composer as soon as the send is queued left the thread without
  // the reply until the sent row's body had loaded.
  it("keeps the composer until the sent reply's body is ready, then swaps them", async () => {
    vi.useFakeTimers();
    htmlBodyReady.current = false;
    try {
      const parent = createReaderMessage("parent", "1000");
      const view = render(
        <EmailThread messages={[parent]} refetch={vi.fn()} showReplyButton />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Reply" }));
      fireEvent.click(screen.getByRole("button", { name: "Queue send" }));
      view.rerender(
        <EmailThread
          messages={[parent]}
          outgoing={[
            {
              operationId: "send-1",
              status: "verifying",
              message: {
                ...createSentMessage("outgoing:send-1", "3000"),
                textHtml: "<p>Reply</p>",
              },
            },
          ]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      await act(async () => vi.advanceTimersByTimeAsync(100));

      const sentRow = view.container.querySelector<HTMLElement>(
        '[data-send-operation-id="send-1"]',
      );
      expect(
        screen.getByLabelText("Email message").closest("[inert]"),
      ).toBeTruthy();
      expect(sentRow?.getAttribute("aria-hidden")).toBe("true");

      sentRow
        ?.querySelector("[data-email-ready]")
        ?.setAttribute("data-email-ready", "true");
      await act(async () => vi.advanceTimersByTimeAsync(20));

      expect(screen.queryByLabelText("Email message")).toBeNull();
      expect(sentRow?.hasAttribute("aria-hidden")).toBe(false);
      expect(
        view.container
          .querySelector('[data-thread-message-id="parent"]')
          ?.querySelector('[data-testid="message-body"]'),
      ).toBeTruthy();
    } finally {
      htmlBodyReady.current = true;
      vi.useRealTimers();
    }
  });

  // The thread publishes a send's message before the composer hears it was queued.
  it("hides a sent reply that reaches the thread before its send is confirmed queued", async () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    htmlBodyReady.current = false;
    try {
      const parent = createReaderMessage("parent", "1000");
      const view = render(
        <EmailThread messages={[parent]} refetch={vi.fn()} showReplyButton />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Reply" }));
      fireEvent.click(screen.getByRole("button", { name: "Submit send" }));
      view.rerender(
        <EmailThread
          messages={[parent]}
          outgoing={[
            {
              operationId: "send-1",
              status: "verifying",
              message: {
                ...createSentMessage("outgoing:send-1", "3000"),
                textHtml: "<p>Reply</p>",
              },
            },
          ]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );

      const sentRow = view.container.querySelector<HTMLElement>(
        '[data-send-operation-id="send-1"]',
      );
      expect(sentRow?.getAttribute("aria-hidden")).toBe("true");
      await act(async () => vi.advanceTimersByTimeAsync(1500));
      expect(sentRow?.getAttribute("aria-hidden")).toBe("true");
      expect(screen.getByLabelText("Email message")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Queue send" }));
      sentRow
        ?.querySelector("[data-email-ready]")
        ?.setAttribute("data-email-ready", "true");
      await act(async () => vi.advanceTimersByTimeAsync(20));

      expect(screen.queryByLabelText("Email message")).toBeNull();
      expect(sentRow?.hasAttribute("aria-hidden")).toBe(false);
    } finally {
      htmlBodyReady.current = true;
      vi.useRealTimers();
    }
  });

  it("keeps a sending mailbox draft's composer until its sent reply takes over", async () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    htmlBodyReady.current = false;
    let showDraftAgain = () => {};
    try {
      const parent = createReaderMessage("parent", "1000");
      const draft = createReaderDraft("draft-1", "2000");
      const view = render(
        <EmailThread
          messages={[parent, draft]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Submit send" }));
      act(() => {
        showDraftAgain = hideSendingDraftMessages("account-1", ["draft-1"]);
      });
      view.rerender(
        <EmailThread
          // Admitting the send drops the mailbox draft it replaces.
          messages={[parent]}
          outgoing={[
            {
              operationId: "send-1",
              status: "verifying",
              message: {
                ...createSentMessage("outgoing:send-1", "3000"),
                textHtml: "<p>Reply</p>",
              },
            },
          ]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      expect(screen.getByLabelText("Email message")).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Queue send" }));
      view.container
        .querySelector('[data-send-operation-id="send-1"] [data-email-ready]')
        ?.setAttribute("data-email-ready", "true");
      await act(async () => vi.advanceTimersByTimeAsync(20));

      expect(screen.queryByLabelText("Email message")).toBeNull();
      expect(
        view.container
          .querySelector('[data-send-operation-id="send-1"]')
          ?.hasAttribute("aria-hidden"),
      ).toBe(false);
    } finally {
      act(() => showDraftAgain());
      htmlBodyReady.current = true;
      vi.useRealTimers();
    }
  });

  it("still hides other drafts while a sent reply is handed off", () => {
    let showDraftAgain = () => {};
    try {
      const parent = createReaderMessage("parent", "1000");
      const view = render(
        <EmailThread
          messages={[parent, createReaderDraft("draft-1", "2000")]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Submit send" }));
      act(() => {
        showDraftAgain = hideSendingDraftMessages("account-1", ["draft-2"]);
      });
      view.rerender(
        <EmailThread
          messages={[
            parent,
            createReaderDraft("draft-1", "2000"),
            createReaderDraft("draft-2", "2500"),
          ]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );

      expect(
        screen
          .getAllByRole("textbox", { name: "Email message" })
          .map((editor) => editor.dataset.providerDraftMessageId),
      ).toEqual(["draft-1"]);
    } finally {
      act(() => showDraftAgain());
    }
  });

  it("closes the composer if the sent reply never shows in the thread", async () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    try {
      render(
        <EmailThread
          messages={[createReaderMessage("parent", "1000")]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Reply" }));
      fireEvent.click(screen.getByRole("button", { name: "Queue send" }));
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(screen.getByLabelText("Email message")).toBeTruthy();

      await act(async () => vi.advanceTimersByTimeAsync(600));
      expect(screen.queryByLabelText("Email message")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The reply has no provider message yet, so a reply to it threads on the
  // newest message the provider has.
  it("replies to an unsent reply on the thread's latest provider message", () => {
    render(
      <EmailThread
        messages={[createReaderMessage("parent", "1000")]}
        outgoing={[
          {
            operationId: "send-1",
            status: "verifying",
            message: createSentMessage("outgoing:send-1", "3000"),
          },
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    const outgoingRow = document.querySelector(
      '[data-thread-message-id="outgoing:send-1"]',
    );
    const reply = Array.from(
      outgoingRow?.querySelectorAll("button") ?? [],
    ).find((button) => button.textContent === "Reply");
    if (!reply) throw new Error("expected a reply button on the sent reply");
    fireEvent.click(reply);

    const composer = screen.getByRole("textbox", { name: "Email message" });
    expect(composer.dataset.draftKeyMessageId).toBe("parent");
    expect(composer.dataset.draftSessionId).toBe("outgoing:send-1:reply");
  });

  it("restores a reply on an outgoing row and keeps it when the sent row takes over", () => {
    localDrafts.current = [
      {
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "outgoing:send-1:reply",
        revision: 1,
        updatedAt: 1000,
        content: { composeMode: "reply" } as StoredReplyDraft["content"],
      },
    ];
    try {
      const parent = createReaderMessage("parent", "1000");
      const view = render(
        <EmailThread
          messages={[parent]}
          outgoing={[
            {
              operationId: "send-1",
              status: "verifying",
              message: createSentMessage("outgoing:send-1", "3000"),
            },
          ]}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      expect(
        screen.getByRole("textbox", { name: "Email message" }).dataset
          .draftSessionId,
      ).toBe("outgoing:send-1:reply");
      const outgoingRow = document.querySelector(
        '[data-thread-message-id="outgoing:send-1"]',
      );
      const replyButton = Array.from(
        outgoingRow?.querySelectorAll("button") ?? [],
      ).find((button) => button.textContent === "Reply");
      if (!replyButton) throw new Error("expected outgoing reply button");
      fireEvent.click(replyButton);
      view.rerender(
        <EmailThread
          messages={[parent, createSentMessage("sent-1", "3000")]}
          sendOperationIds={new Map([["sent-1", "send-1"]])}
          refetch={vi.fn()}
          showReplyButton
        />,
      );
      expect(
        screen.getByRole("textbox", { name: "Email message" }).dataset
          .draftSessionId,
      ).toBe("outgoing:send-1:reply");
    } finally {
      localDrafts.current = [];
    }
  });

  // Outlook sends a saved draft as that same message. Its local copy is only
  // cleared once the send settles, and must not reopen as a reply meanwhile.
  it("does not reopen a sent draft's local copy as a reply on the sent message", () => {
    localDrafts.current = [
      {
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "draft-1:reply",
        revision: 1,
        content: { composeMode: "reply" } as StoredReplyDraft["content"],
        updatedAt: 1,
      },
    ];
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createSentMessage("draft-1", "4000"),
        ]}
        sendOperationIds={new Map([["draft-1", "send-1"]])}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Email message" })).toBeNull();
    localDrafts.current = [];
  });
});

describe("EmailThread scheduled send drafts", () => {
  afterEach(() => {
    cleanup();
    scheduledEmails.current = [];
  });

  // A scheduled send goes out from its mailbox draft, which stays in the
  // thread until then. The delivery status stands in for it meanwhile.
  it("hides the mailbox draft of a pending scheduled send", () => {
    scheduledEmails.current = [
      { status: "PENDING", draftMessageIds: ["draft-old", "draft-1"] },
    ];
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createReaderDraft("draft-1", "2000"),
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    expect(screen.queryByRole("textbox", { name: "Email message" })).toBeNull();
  });

  it("shows the draft again once its scheduled send is no longer pending", () => {
    scheduledEmails.current = [
      { status: "FAILED", draftMessageIds: ["draft-1"] },
    ];
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createReaderDraft("draft-1", "2000"),
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    expect(
      screen.getByRole("textbox", { name: "Email message" }).dataset
        .providerDraftMessageId,
    ).toBe("draft-1");
  });

  it("hides a draft while its send is held, and shows it again once undone", () => {
    const showDraftAgain = hideSendingDraftMessages("account-1", ["draft-1"]);
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createReaderDraft("draft-1", "2000"),
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );
    expect(screen.queryByRole("textbox", { name: "Email message" })).toBeNull();

    act(() => showDraftAgain());

    expect(
      screen.getByRole("textbox", { name: "Email message" }).dataset
        .providerDraftMessageId,
    ).toBe("draft-1");
  });
});

describe("EmailThread draft discard", () => {
  afterEach(() => {
    cleanup();
    discardDraft.mockReset();
  });

  // A draft opened from the Drafts folder is the entire conversation, so once
  // it is discarded there is nothing left to read and the reader has to leave.
  it("reports the conversation as gone when its only draft is discarded", async () => {
    const onThreadDiscarded = vi.fn();
    render(
      <EmailThread
        messages={[createReaderDraft("draft-1", "1000")]}
        onThreadDiscarded={onThreadDiscarded}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await act(async () => {});

    expect(onThreadDiscarded).toHaveBeenCalledTimes(1);
  });

  it.each([
    "action error",
    "exception",
  ])("keeps the conversation and restores its draft after a deletion %s", async (failure) => {
    if (failure === "action error") {
      discardDraft.mockResolvedValue({ serverError: "Deletion failed" });
    } else {
      discardDraft.mockRejectedValue(new Error("Deletion failed"));
    }
    const onThreadDiscarded = vi.fn();
    render(
      <EmailThread
        messages={[createReaderDraft("failed-draft", "1000")]}
        onThreadDiscarded={onThreadDiscarded}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await act(async () => {});

    expect(screen.getByRole("textbox", { name: "Email message" })).toBeTruthy();
    expect(onThreadDiscarded).not.toHaveBeenCalled();
  });

  it("keeps a draft-only conversation open while another draft remains", async () => {
    const onThreadDiscarded = vi.fn();
    render(
      <EmailThread
        messages={[
          createReaderDraft("draft-1", "1000"),
          createReaderDraft("draft-2", "2000"),
        ]}
        onThreadDiscarded={onThreadDiscarded}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: "Discard draft" })[0],
    );
    await act(async () => {});

    expect(
      screen.getAllByRole("textbox", { name: "Email message" }),
    ).toHaveLength(1);
    expect(onThreadDiscarded).not.toHaveBeenCalled();
  });

  it("keeps the conversation open when a reply draft on a message is discarded", async () => {
    const onThreadDiscarded = vi.fn();
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createReaderDraft("draft-1", "2000"),
        ]}
        onThreadDiscarded={onThreadDiscarded}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await act(async () => {});

    expect(screen.queryByRole("textbox", { name: "Email message" })).toBeNull();
    expect(onThreadDiscarded).not.toHaveBeenCalled();
  });
});

describe("EmailThread mailbox copies of local replies", () => {
  afterEach(() => {
    cleanup();
    localDrafts.current = [];
    localDrafts.isLoading = false;
  });

  it("edits a reply from its local copy once its mailbox copy syncs back", () => {
    localDrafts.isLoading = true;
    const messages = [
      createReaderMessage("parent", "1000"),
      createReaderDraft("mailbox-copy", "2000"),
    ];
    const view = render(
      <EmailThread messages={messages} refetch={vi.fn()} showReplyButton />,
    );
    expect(screen.queryByRole("textbox", { name: "Email message" })).toBeNull();
    localDrafts.isLoading = false;
    localDrafts.current = [
      {
        emailAccountId: "account-1",
        threadId: "thread-1",
        messageId: "parent:reply",
        revision: 1,
        content: {
          composeMode: "reply",
          providerDraftMessageIds: ["mailbox-copy"],
        } as StoredReplyDraft["content"],
        updatedAt: 1,
      },
    ];
    view.rerender(
      <EmailThread messages={messages} refetch={vi.fn()} showReplyButton />,
    );

    const composers = screen.getAllByRole("textbox", { name: "Email message" });
    expect(composers).toHaveLength(1);
    expect(composers[0]?.dataset.draftSessionId).toBe("parent:reply");
  });

  it("hides a discarded reply's mailbox copy until sync removes it", async () => {
    render(
      <EmailThread
        messages={[
          createReaderMessage("parent", "1000"),
          createReaderDraft("discarded-copy", "2000"),
        ]}
        refetch={vi.fn()}
        showReplyButton
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
    await act(async () => {});
    expect(screen.queryByRole("textbox", { name: "Email message" })).toBeNull();
  });
});

describe("organizeThreadMessages", () => {
  it("attaches a draft to the message its headers reply to", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const second = createMessage({
      id: "second",
      messageId: "<second@example.com>",
    });
    const draft = createDraft({
      id: "draft",
      inReplyTo: "<first@example.com>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.map(({ message }) => message.id)).toEqual([
      "first",
      "second",
    ]);
    expect(organized.at(0)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
    expect(organized.at(1)?.draftMessages).toEqual([]);
  });

  it("prefers the last entry of the references header", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const second = createMessage({
      id: "second",
      messageId: "<second@example.com>",
    });
    const draft = createDraft({
      id: "draft",
      references: "<first@example.com> <second@example.com>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.at(1)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
  });

  // Outlook thread messages carry no References header and expose In-Reply-To
  // only when full internet headers are fetched, so its drafts arrive with no
  // parent to match. They were previously dropped from the thread entirely.
  it("shows a draft that has no threading headers on the last message", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const second = createMessage({
      id: "second",
      messageId: "<second@example.com>",
    });
    const draft = createDraft({ id: "outlook-draft" });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized).toHaveLength(2);
    expect(organized.at(0)?.draftMessages).toEqual([]);
    expect(organized.at(1)?.draftMessages.map((draft) => draft.id)).toEqual([
      "outlook-draft",
    ]);
  });

  it("shows a draft whose parent is not part of the thread", () => {
    const only = createMessage({ id: "only", messageId: "<only@example.com>" });
    const draft = createDraft({
      id: "draft",
      inReplyTo: "<elsewhere@example.com>",
    });

    const organized = organizeThreadMessages([only, draft]);

    expect(organized.at(0)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
  });

  it("falls back to the last message when no message id matches the draft's parent", () => {
    const first = createMessage({ id: "first", messageId: undefined });
    const second = createMessage({ id: "second", messageId: undefined });
    const draft = createDraft({
      id: "draft",
      inReplyTo: "<missing@example.com>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.at(0)?.draftMessages).toEqual([]);
    expect(organized.at(1)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
  });

  it("keeps all drafts when several resolve to the same parent", () => {
    const only = createMessage({ id: "only", messageId: "<only@example.com>" });
    const older = createDraft({
      id: "older-draft",
      internalDate: "1000",
    });
    const newer = createDraft({
      id: "newer-draft",
      internalDate: "2000",
    });

    const organized = organizeThreadMessages([only, newer, older]);

    expect(organized).toHaveLength(1);
    expect(organized.at(0)?.draftMessages.map((draft) => draft.id)).toEqual([
      "older-draft",
      "newer-draft",
    ]);
  });

  it("preserves every draft in a draft-only thread", () => {
    const drafts = [
      createDraft({ id: "first" }),
      createDraft({ id: "second" }),
    ];
    expect(
      organizeThreadMessages(drafts).flatMap(
        ({ draftMessages }) => draftMessages,
      ),
    ).toEqual(drafts);
  });

  it("normalizes folded and trailing whitespace in references", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const last = createMessage({ id: "last", messageId: "<last@example.com>" });
    const draft = createDraft({
      id: "draft",
      references: "<older@example.com>\r\n\t<first@example.com>  ",
    });
    expect(
      organizeThreadMessages([first, last, draft])[0].draftMessages,
    ).toEqual([draft]);
  });

  it("handles an empty thread", () => {
    expect(organizeThreadMessages([])).toEqual([]);
  });
});

function createMessage({
  id,
  messageId,
}: {
  id: string;
  messageId?: string;
}): ThreadMessage {
  return {
    id,
    threadId: "thread",
    labelIds: ["INBOX"],
    headers: { "message-id": messageId },
  } as unknown as ThreadMessage;
}

function createDraft({
  id,
  inReplyTo,
  references,
  internalDate,
}: {
  id: string;
  inReplyTo?: string;
  references?: string;
  internalDate?: string;
}): ThreadMessage {
  return {
    id,
    threadId: "thread",
    labelIds: ["DRAFT"],
    headers: { "in-reply-to": inReplyTo, references },
    internalDate,
  } as unknown as ThreadMessage;
}

function createReaderDraft(id: string, internalDate: string) {
  return {
    ...createReaderMessage(id, internalDate),
    labelIds: ["DRAFT"],
    textHtml: "<p>Saved reply</p>",
  } as ThreadMessage;
}

function MockComposer({
  draftKeyMessageId,
  draftSessionId,
  providerDraftMessageId,
  onSubmitting,
  onClose,
  onDiscard,
}: {
  draftKeyMessageId?: string;
  draftSessionId?: string;
  providerDraftMessageId?: string;
  onSubmitting?: (operationId: string) => () => void;
  onClose?: (queuedOperationId?: string) => void;
  onDiscard?: () => void;
}) {
  useState(() => {
    composerMounts += 1;
  });
  return (
    <>
      <textarea
        aria-label="Email message"
        data-draft-key-message-id={draftKeyMessageId}
        data-draft-session-id={draftSessionId}
        data-provider-draft-message-id={providerDraftMessageId}
      />
      <button onClick={() => onClose?.()} type="button">
        Send
      </button>
      <button
        onClick={() => {
          onSubmitting?.("send-1");
        }}
        type="button"
      >
        Submit send
      </button>
      <button onClick={() => onClose?.("send-1")} type="button">
        Queue send
      </button>
      <button onClick={onDiscard} type="button">
        Discard draft
      </button>
    </>
  );
}

function createSentMessage(id: string, internalDate: string) {
  return {
    ...createReaderMessage(id, internalDate),
    labelIds: ["SENT"],
  } as ThreadMessage;
}

function createReaderMessage(id: string, internalDate: string) {
  return {
    date: new Date(Number(internalDate)).toISOString(),
    headers: {
      date: new Date(Number(internalDate)).toISOString(),
      from: "sender@example.com",
      subject: "Subject",
      to: "user@example.com",
      "message-id": `<${id}@example.com>`,
    },
    historyId: "history-1",
    id,
    inline: [],
    internalDate,
    labelIds: ["INBOX"],
    snippet: "Preview",
    subject: "Subject",
    textPlain: "Message body",
    threadId: "thread-1",
  } as unknown as ThreadMessage;
}
