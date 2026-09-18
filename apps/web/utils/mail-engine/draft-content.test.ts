import { describe, expect, it } from "vitest";
import { sendEmailToDraftContent } from "./draft-content";

describe("sendEmailToDraftContent", () => {
  it("splits recipients and keeps the send html on the editable body", () => {
    expect(
      sendEmailToDraftContent(
        {
          to: "Ada <ada@example.com>, lin@example.com",
          cc: "cc@example.com",
          bcc: "",
          subject: "Hello",
          messageHtml: "<p>Hi</p>",
        },
        ["blob-1"],
      ),
    ).toEqual({
      attachmentIds: ["blob-1"],
      bcc: [],
      cc: ["cc@example.com"],
      editableHtml: "<p>Hi</p>",
      quotedHtml: "",
      subject: "Hello",
      to: ["Ada <ada@example.com>", "lin@example.com"],
    });
  });
});
