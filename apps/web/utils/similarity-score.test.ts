import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateSimilarity } from "./similarity-score";
import { parseReply } from "@/utils/mail";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/mail");

describe("calculateSimilarity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Provide a default mock implementation for parseReply for most tests
    vi.mocked(parseReply).mockImplementation((text) => text || "");
  });

  it("should return 0.0 if either text is null or undefined", () => {
    expect(calculateSimilarity(null, "text2")).toBe(0.0);
    expect(calculateSimilarity("text1", undefined)).toBe(0.0);
    expect(calculateSimilarity(null, null)).toBe(0.0);
  });

  it("should return 0.0 if either normalized text is empty", () => {
    // Mock parseReply to return empty string for one case
    vi.mocked(parseReply).mockImplementation((text) =>
      text === "text1" ? "" : text || "",
    );
    expect(calculateSimilarity("text1", "text2")).toBe(0.0);

    vi.mocked(parseReply).mockImplementation((text) =>
      text === "text2" ? "" : text || "",
    );
    expect(calculateSimilarity("text1", "text2")).toBe(0.0);
  });

  it("should return 1.0 if both normalized texts are empty", () => {
    vi.mocked(parseReply).mockImplementation(() => ""); // Both parse to empty
    expect(calculateSimilarity("text1", "text2")).toBe(1.0);
  });

  it("should call parseReply for both texts", () => {
    const text1 = "Reply 1\n> Quoted text";
    const text2 = "Reply 2";
    // Let parseReply return specific values for checking
    vi.mocked(parseReply).mockImplementation((text) => {
      if (text === text1) return "Reply 1 parsed";
      if (text === text2) return "Reply 2 parsed";
      return "";
    });

    calculateSimilarity(text1, text2);

    expect(parseReply).toHaveBeenCalledTimes(2);
    expect(parseReply).toHaveBeenCalledWith(text1);
    expect(parseReply).toHaveBeenCalledWith(text2);
  });

  it("should calculate similarity based on normalized parsed replies", () => {
    const text1 = "  Reply ONE \n> Quoted";
    const text2 = "reply two";
    const parsed1 = "Reply ONE"; // What parseReply returns for text1
    const parsed2 = "reply two"; // What parseReply returns for text2

    vi.mocked(parseReply).mockImplementation((text) => {
      if (text === text1) return parsed1;
      if (text === text2) return parsed2;
      return "";
    });

    const expectedScore = 0.571_428_571_428_571_4;

    const score = calculateSimilarity(text1, text2);

    expect(score).toBeCloseTo(expectedScore);
  });

  it("should return 1.0 if normalized parsed texts are identical", () => {
    const text1 = "Identical Text";
    const text2 = "  identical text \n> Old stuff";
    vi.mocked(parseReply).mockImplementation((text) => {
      if (text === text1) return "Identical Text";
      if (text === text2) return "identical text"; // parseReply extracts the relevant part
      return "";
    });

    const score = calculateSimilarity(text1, text2);

    // "Identical Text" vs "identical text" -> normalized "identical text" vs "identical text"
    expect(score).toBe(1.0);
  });

  it("should return 0.0 if normalized texts are completely different", () => {
    const text1 = "First";
    const text2 = "Second";
    vi.mocked(parseReply).mockImplementation((text) => text); // Simple mock

    const score = calculateSimilarity(text1, text2);

    expect(score).toBe(0.0);
  });

  it("should handle special characters in normalization", () => {
    const text1 = "Text with $pecial chars!";
    const text2 = "text with $pecial chars!";
    vi.mocked(parseReply).mockImplementation((text) => text);

    const score = calculateSimilarity(text1, text2);
    // Normalization is just toLowerCase() and trim(). Special chars remain.
    expect(score).toBe(1.0);
  });

  it("should handle slightly different but similar texts", () => {
    const text1 = "This is the first sentence.";
    const text2 = "This is the second sentence.";
    vi.mocked(parseReply).mockImplementation((text) => text);

    const score = calculateSimilarity(text1, text2);

    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
    expect(score).toBeCloseTo(0.711_111_111_111_111_1);
  });

  it("should handle a realistic email example with a minor change", () => {
    const text1 = `Hi Team,

Just a quick reminder about the meeting tomorrow at 10 AM. Please come prepared to discuss the quarterly results.

Thanks,
Bob

> On Mon, Oct 23, 2023 at 4:15 PM Alice wrote:
> Blah blah blah`;

    const text2 = `Hi Team,

Just a quick reminder about the all-hands meeting tomorrow at 10 AM. Please come prepared to discuss the quarterly results.

Best,
Bob
`;

    const parsed1 = `Hi Team,

Just a quick reminder about the meeting tomorrow at 10 AM. Please come prepared to discuss the quarterly results.

Thanks,
Bob`;
    const parsed2 = `Hi Team,

Just a quick reminder about the all-hands meeting tomorrow at 10 AM. Please come prepared to discuss the quarterly results.

Best,
Bob`;

    vi.mocked(parseReply).mockImplementation((text) => {
      if (text === text1) return parsed1;
      if (text === text2) return parsed2;
      return text || ""; // Fallback for safety
    });

    const score = calculateSimilarity(text1, text2);

    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1.0);
    expect(score).toBe(0.917_030_567_685_589_5);
  });
});
