import { describe, expect, it } from "vitest";
import { buildThunderbirdTriageActions } from "./suggest-triage";

const messageRef = {
  messageId: "tb-msg-1",
  threadId: "tb-thread-1",
  thunderbirdMessageId: 42,
  thunderbirdAccountId: "account-1",
};

describe("buildThunderbirdTriageActions", () => {
  it("tags and archives newsletters", () => {
    const actions = buildThunderbirdTriageActions("newsletter", messageRef);

    expect(actions.map((action) => action.type)).toEqual([
      "label",
      "archive",
      "mark_read",
    ]);
    expect(actions[0]).toMatchObject({
      type: "label",
      labelName: "newsletter",
      thunderbirdMessageId: 42,
    });
  });

  it("tags receipts separately from newsletters", () => {
    const actions = buildThunderbirdTriageActions("receipt", messageRef);

    expect(actions[0]).toMatchObject({
      type: "label",
      labelName: "receipt",
    });
    expect(actions.map((action) => action.type)).toContain("archive");
  });

  it("labels needs-attention without archiving", () => {
    const actions = buildThunderbirdTriageActions(
      "needs_attention",
      messageRef,
    );

    expect(actions.map((action) => action.type)).toEqual([
      "label",
      "mark_read",
    ]);
    expect(actions[0]).toMatchObject({
      type: "label",
      labelName: "needs-attention",
    });
  });

  it("trashes junk", () => {
    const actions = buildThunderbirdTriageActions("junk", messageRef);

    expect(actions).toEqual([
      expect.objectContaining({
        type: "trash",
        messageId: "tb-msg-1",
        thunderbirdMessageId: 42,
      }),
    ]);
  });

  it("proposes nothing when keep is chosen", () => {
    expect(buildThunderbirdTriageActions("keep", messageRef)).toEqual([]);
  });
});
