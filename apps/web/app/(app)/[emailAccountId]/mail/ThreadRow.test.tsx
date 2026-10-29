/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadRow } from "./ThreadRow";
import type { ListThread } from "./types";
import type { EmailLabels } from "@/providers/email-label-types";

(globalThis as { React?: typeof React }).React = React;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThreadRow", () => {
  it("shows an attachment indicator when any message in the thread has one", () => {
    render(row(thread([false, true])));

    expect(screen.getByText("Has attachment")).toBeTruthy();
  });

  it("omits the attachment indicator for threads without attachments", () => {
    render(row(thread([false, undefined])));

    expect(screen.queryByText("Has attachment")).toBeNull();
  });

  it("copies a one-time code from the row without opening the thread", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onOpen = vi.fn();
    const otpLabel = { id: "Label_otp", name: "OTP" };
    render(
      row(thread([undefined], "Use code 235578 to log in", [otpLabel.id]), {
        onOpen,
        userLabels: { [otpLabel.id]: otpLabel },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy code 235578" }));

    expect(writeText).toHaveBeenCalledWith("235578");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does not offer a code to copy on ordinary mail with numbers", () => {
    render(row(thread([undefined], "Invoice 482913 for October")));

    expect(screen.queryByRole("button", { name: /Copy code/ })).toBeNull();
  });
});

function row(
  listThread: ListThread,
  {
    onOpen = () => {},
    userLabels = {},
  }: { onOpen?: (index: number) => void; userLabels?: EmailLabels } = {},
) {
  return (
    <ThreadRow
      hasAnySelection={false}
      index={0}
      isFocused={false}
      isSelected={false}
      layout="list"
      onOpen={onOpen}
      onSelectRangeTo={() => {}}
      onToggleSelect={() => {}}
      selectionEnabled={false}
      thread={listThread}
      userEmail="me@example.com"
      userLabels={userLabels}
    />
  );
}

function thread(
  attachments: Array<boolean | undefined>,
  subject = "Subject",
  labelIds: string[] = [],
): ListThread {
  const date = "2026-10-12T10:00:00.000Z";
  return {
    id: "thread-1",
    messageIds: attachments.map((_, index) => `message-${index}`),
    snippet: "Snippet",
    plan: undefined,
    plans: [],
    participantMessages: undefined,
    messages: attachments.map((hasAttachment, index) => ({
      id: `message-${index}`,
      threadId: "thread-1",
      snippet: "Snippet",
      subject,
      date,
      internalDate: String(Date.parse(date)),
      labelIds: ["INBOX", ...labelIds],
      parentFolderId: undefined,
      hasAttachment,
      headers: {
        from: "Ada <ada@example.com>",
        to: "me@example.com",
        date,
        subject,
      },
    })),
  };
}
