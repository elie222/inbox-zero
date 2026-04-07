import { describe, expect, it } from "vitest";
import {
  buildThreadId,
  getAllThreadMessageIds,
  getRootMessageId,
  parseMessageIdList,
} from "@/utils/imap/thread";

describe("parseMessageIdList", () => {
  it("parses angle-bracket message IDs", () => {
    const result = parseMessageIdList(
      "<abc@example.com> <def@example.com> <ghi@example.com>",
    );
    expect(result).toEqual([
      "abc@example.com",
      "def@example.com",
      "ghi@example.com",
    ]);
  });

  it("handles single message ID", () => {
    const result = parseMessageIdList("<single@example.com>");
    expect(result).toEqual(["single@example.com"]);
  });

  it("falls back to whitespace splitting for bare IDs", () => {
    const result = parseMessageIdList("abc@example.com def@example.com");
    expect(result).toEqual(["abc@example.com", "def@example.com"]);
  });

  it("returns empty array for empty string", () => {
    const result = parseMessageIdList("");
    expect(result).toEqual([]);
  });
});

describe("getRootMessageId", () => {
  it("returns first reference as root", () => {
    const result = getRootMessageId(
      "<root@ex.com> <reply1@ex.com> <reply2@ex.com>",
      "<reply2@ex.com>",
      "<reply3@ex.com>",
    );
    expect(result).toBe("root@ex.com");
  });

  it("falls back to inReplyTo when no references", () => {
    const result = getRootMessageId(
      undefined,
      "<parent@ex.com>",
      "<child@ex.com>",
    );
    expect(result).toBe("parent@ex.com");
  });

  it("falls back to messageId when no threading headers", () => {
    const result = getRootMessageId(undefined, undefined, "<only@ex.com>");
    expect(result).toBe("<only@ex.com>");
  });

  it("returns 'unknown' when all headers are missing", () => {
    const result = getRootMessageId(undefined, undefined, undefined);
    expect(result).toBe("unknown");
  });
});

describe("buildThreadId", () => {
  it("returns consistent hash for same root message", () => {
    const id1 = buildThreadId(
      "<root@ex.com> <r1@ex.com>",
      "<r1@ex.com>",
      "<r2@ex.com>",
    );
    const id2 = buildThreadId(
      "<root@ex.com> <r1@ex.com> <r2@ex.com>",
      "<r2@ex.com>",
      "<r3@ex.com>",
    );
    // Both should hash the same root: "root@ex.com"
    expect(id1).toBe(id2);
  });

  it("returns different hashes for different threads", () => {
    const id1 = buildThreadId("<thread1@ex.com>", undefined, undefined);
    const id2 = buildThreadId("<thread2@ex.com>", undefined, undefined);
    expect(id1).not.toBe(id2);
  });

  it("returns a 24-character hex string", () => {
    const id = buildThreadId("<msg@ex.com>", undefined, undefined);
    expect(id).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("getAllThreadMessageIds", () => {
  it("collects all unique message IDs from headers", () => {
    const ids = getAllThreadMessageIds(
      "<a@ex.com> <b@ex.com>",
      "<b@ex.com>",
      "<c@ex.com>",
    );
    expect(ids).toContain("a@ex.com");
    expect(ids).toContain("b@ex.com");
    expect(ids).toContain("c@ex.com");
    expect(ids).toHaveLength(3);
  });

  it("deduplicates IDs across headers", () => {
    const ids = getAllThreadMessageIds(
      "<same@ex.com>",
      "<same@ex.com>",
      "<same@ex.com>",
    );
    expect(ids).toHaveLength(1);
  });

  it("returns empty array when all headers are missing", () => {
    const ids = getAllThreadMessageIds(undefined, undefined, undefined);
    expect(ids).toHaveLength(0);
  });
});
