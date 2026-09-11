import { describe, expect, it } from "vitest";
import { createThreadDetailVariant, createThreadListCacheKey } from "./keys";

describe("createThreadListCacheKey", () => {
  it("produces the same key for equivalent queries", () => {
    const first = createThreadListCacheKey({
      labelIds: ["UNREAD", "INBOX"],
      before: new Date("2026-08-11T12:00:00.000Z"),
      type: "inbox",
      limit: null,
    });
    const second = createThreadListCacheKey({
      type: "inbox",
      before: new Date("2026-08-11T12:00:00.000Z"),
      labelIds: ["INBOX", "UNREAD"],
    });

    expect(first).toBe(second);
  });

  it("does not include provider continuation tokens", () => {
    const first = createThreadListCacheKey({
      type: "inbox",
      nextPageToken: "page-one",
    });
    const second = createThreadListCacheKey({
      type: "inbox",
      nextPageToken: "page-two",
    });

    expect(first).toBe(second);
    expect(first).not.toContain("page-one");
  });
});

describe("createThreadDetailVariant", () => {
  it("isolates response shapes that include drafts or parsed replies", () => {
    expect(createThreadDetailVariant()).toBe("drafts:0|replies:0");
    expect(createThreadDetailVariant({ includeDrafts: true })).toBe(
      "drafts:1|replies:0",
    );
    expect(createThreadDetailVariant({ parseReplies: true })).toBe(
      "drafts:0|replies:1",
    );
  });
});
