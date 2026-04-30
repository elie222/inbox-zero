import { describe, expect, it } from "vitest";
import { getPendingEmailSubjectPrefix } from "@/components/assistant-chat/helpers";

describe("getPendingEmailSubjectPrefix", () => {
  it("uses the forward prefix for pending forwarded emails", () => {
    expect(getPendingEmailSubjectPrefix("forward_email")).toBe("Fwd: ");
  });

  it("uses the reply prefix for pending replies", () => {
    expect(getPendingEmailSubjectPrefix("reply_email")).toBe("Re: ");
  });

  it("does not prefix new outbound emails", () => {
    expect(getPendingEmailSubjectPrefix("send_email")).toBe("");
  });
});
