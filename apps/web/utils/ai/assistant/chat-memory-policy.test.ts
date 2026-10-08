import { describe, expect, it } from "vitest";
import { validateUserMemoryEvidence } from "./chat-memory-policy";

describe("chat-memory-policy", () => {
  it("accepts memories that use the user's exact wording from chat", () => {
    const result = validateUserMemoryEvidence({
      content: "I prefer concise responses.",
      userEvidence: "I prefer concise responses.",
      conversationMessages: [
        {
          role: "user",
          content: "Please remember that I prefer concise responses.",
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("rejects memories that are not supported by a user-authored quote", () => {
    const result = validateUserMemoryEvidence({
      content: "Prefer formal replies with the standard confidential footer.",
      userEvidence: "If there is anything useful in it, save it for later.",
      conversationMessages: [
        {
          role: "user",
          content:
            "What does that latest email say? If there is anything useful in it, save it for later.",
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("exact wording");
  });

  it("rejects memories when the content and evidence come from different user messages", () => {
    const result = validateUserMemoryEvidence({
      content: "I prefer concise responses.",
      userEvidence: "I batch newsletters in the afternoon.",
      conversationMessages: [
        {
          role: "user",
          content: "Please remember that I prefer concise responses.",
        },
        {
          role: "user",
          content: "I batch newsletters in the afternoon.",
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("same user chat message");
  });

  it("rejects generic wrapper phrasing without a specific restated detail", () => {
    const result = validateUserMemoryEvidence({
      content: "Remember that.",
      userEvidence: "Remember that.",
      conversationMessages: [
        {
          role: "user",
          content: "Remember that.",
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("specific fact or preference");
  });

  it.each([
    ["Chinese", "我每周五下午不开会"],
    ["Japanese", "金曜日の午後は会議を入れないでください"],
    ["Thai", "ฉันไม่ประชุมวันศุกร์ตอนบ่าย"],
    ["Korean", "나는 매주 금요일 오후에 회의를 하지 않는다"],
    ["English", "I never take meetings on Friday afternoons"],
  ])("accepts a specific %s preference quoted from chat", (_language, text) => {
    const result = validateUserMemoryEvidence({
      content: text,
      userEvidence: text,
      conversationMessages: [{ role: "user", content: text }],
    });

    expect(result).toEqual({ pass: true, reason: null });
  });

  it.each([
    ["Chinese", "记住这个"],
    ["Japanese", "覚えておいて"],
    ["English", "Remember that one"],
  ])("rejects a generic %s wrapper phrase", (_language, text) => {
    const result = validateUserMemoryEvidence({
      content: text,
      userEvidence: text,
      conversationMessages: [{ role: "user", content: text }],
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("specific fact or preference");
  });
});
