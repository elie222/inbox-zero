// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadMessage } from "@/components/email-list/types";
import { rememberReplacedDraftMessage } from "@/utils/mail-engine/reply-drafts";
import {
  EmailThread,
  organizeThreadMessages,
} from "@/components/email-list/EmailThread";

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: vi.fn() }),
}));
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
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
vi.mock("@/components/email-list/EmailContents", () => ({
  HtmlEmail: () => null,
  PlainEmail: () => null,
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
vi.mock("@/hooks/useReplyDrafts", () => ({
  useReplyDrafts: () => ({ drafts: [] }),
}));
vi.mock("@/hooks/useSentMessageOpens", () => ({
  useSentMessageOpens: () => ({ data: undefined }),
}));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));
vi.mock("@/utils/actions/mail", () => ({ deleteDraftAction: vi.fn() }));
vi.mock("@/utils/actions/generate-reply", () => ({
  generateNudgeReplyAction: vi.fn(),
}));
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
      [parent, draftV1, createReaderDraft("draft-v2", "3000")],
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

      expect(screen.queryByText(/hasn.t loaded yet/)).toBeNull();
      const current = screen.getByRole("textbox", { name: "Email message" });
      expect(current.dataset.draftSessionId).toBe("draft-v1:reply");
      expect(current.dataset.providerDraftMessageId).toBe("draft-v2");
      expect(composerMounts).toBe(1);
    }
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
  draftSessionId,
  providerDraftMessageId,
}: {
  draftSessionId?: string;
  providerDraftMessageId?: string;
}) {
  useState(() => {
    composerMounts += 1;
  });
  return (
    <textarea
      aria-label="Email message"
      data-draft-session-id={draftSessionId}
      data-provider-draft-message-id={providerDraftMessageId}
    />
  );
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
