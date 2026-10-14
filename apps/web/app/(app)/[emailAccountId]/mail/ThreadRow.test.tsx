/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThreadRow } from "./ThreadRow";
import type { ListThread } from "./types";

(globalThis as { React?: typeof React }).React = React;

afterEach(cleanup);

describe("ThreadRow", () => {
  it("shows an attachment indicator when any message in the thread has one", () => {
    render(row(thread([false, true])));

    expect(screen.getByText("Has attachment")).toBeTruthy();
  });

  it("omits the attachment indicator for threads without attachments", () => {
    render(row(thread([false, undefined])));

    expect(screen.queryByText("Has attachment")).toBeNull();
  });
});

function row(listThread: ListThread) {
  return (
    <ThreadRow
      hasAnySelection={false}
      index={0}
      isFocused={false}
      isSelected={false}
      layout="list"
      onOpen={() => {}}
      onSelectRangeTo={() => {}}
      onToggleSelect={() => {}}
      selectionEnabled={false}
      thread={listThread}
      userEmail="me@example.com"
      userLabels={{}}
    />
  );
}

function thread(attachments: Array<boolean | undefined>): ListThread {
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
      subject: "Subject",
      date,
      internalDate: String(Date.parse(date)),
      labelIds: ["INBOX"],
      parentFolderId: undefined,
      hasAttachment,
      headers: {
        from: "Ada <ada@example.com>",
        to: "me@example.com",
        date,
        subject: "Subject",
      },
    })),
  };
}
