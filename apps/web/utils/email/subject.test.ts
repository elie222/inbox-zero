import { describe, expect, it } from "vitest";
import { getConversationSubject } from "@/utils/email/subject";

describe("getConversationSubject", () => {
  it("keeps the first message's subject after a reply", () => {
    expect(
      getConversationSubject([
        message("Project update", ["INBOX"]),
        message("Re: Project update", ["SENT"]),
      ]),
    ).toBe("Project update");
  });

  it("is not renamed by a draft", () => {
    expect(
      getConversationSubject([
        message("Draft subject", ["DRAFT"]),
        message("Project update", ["INBOX"]),
      ]),
    ).toBe("Project update");
  });

  it("skips a trashed first message, as the mailbox list does", () => {
    expect(
      getConversationSubject([
        message("Project update", ["TRASH"]),
        message("Re: Project update", ["INBOX"]),
      ]),
    ).toBe("Re: Project update");
  });

  it("uses the latest draft when the conversation has nothing else", () => {
    expect(
      getConversationSubject([
        message("Old draft subject", ["DRAFT"]),
        message("New draft subject", ["DRAFT"]),
      ]),
    ).toBe("New draft subject");
  });
});

function message(subject: string, labelIds: string[]) {
  return { headers: { subject }, labelIds };
}
