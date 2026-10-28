import { describe, expect, it } from "vitest";
import {
  inspectCommandIsActive,
  inspectCommandMatches,
  inspectCommandMatchesThread,
} from "./mail-inspect-command";

const setRead = ({
  read,
  conversationIds = [],
  messageIds = [],
  status = "succeeded",
}: {
  read: boolean;
  conversationIds?: string[];
  messageIds?: string[];
  status?: string;
}) => ({
  status,
  kind: "conversations",
  changeKind: "set_read",
  change: { kind: "set_read", read },
  conversationIds,
  messageIds,
});

describe("inspectCommandMatchesThread", () => {
  it("matches conversation ids from a preparing conversations command", () => {
    expect(
      inspectCommandMatchesThread(
        {
          conversationIds: ["thr_playwright_reader"],
          messageIds: ["msg_playwright_reader_1"],
        },
        "thr_playwright_reader",
      ),
    ).toBe(true);
  });

  it("matches metadata commands that only freeze message ids", () => {
    expect(
      inspectCommandMatchesThread(
        {
          conversationIds: [],
          messageIds: ["msg_playwright_reader_1", "msg_playwright_reader_2"],
        },
        "thr_playwright_reader",
      ),
    ).toBe(true);
  });

  it("does not treat a different seeded thread as the same conversation", () => {
    expect(
      inspectCommandMatchesThread(
        {
          conversationIds: [],
          messageIds: ["msg_playwright_archive"],
        },
        "thr_playwright_reader",
      ),
    ).toBe(false);
  });
});

describe("inspectCommandMatches", () => {
  it("picks the unread metadata command instead of an earlier mark-read", () => {
    const commands = [
      setRead({
        read: true,
        conversationIds: ["thr_playwright_reader"],
        messageIds: ["msg_playwright_reader_1"],
      }),
      setRead({
        read: false,
        messageIds: ["msg_playwright_reader_1", "msg_playwright_reader_2"],
      }),
    ];

    const unread = commands.filter((command) =>
      inspectCommandMatches(command, {
        kind: "set_read_state",
        threadId: "thr_playwright_reader",
        payload: { read: false },
      }),
    );

    expect(unread).toHaveLength(1);
    expect(unread[0]?.change).toEqual({ kind: "set_read", read: false });
  });
});

describe("inspectCommandIsActive", () => {
  it("hides cancelled and superseded commands from the outbox helper", () => {
    expect(inspectCommandIsActive({ status: "queued" })).toBe(true);
    expect(inspectCommandIsActive({ status: "cancelled" })).toBe(false);
    expect(inspectCommandIsActive({ status: "superseded" })).toBe(false);
  });
});
