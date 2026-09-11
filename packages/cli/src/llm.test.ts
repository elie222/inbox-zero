import { describe, expect, it } from "vitest";
import { getDefaultLlmModels } from "./llm";

describe("getDefaultLlmModels", () => {
  it("should return valid Google Gemini model IDs", () => {
    expect(getDefaultLlmModels("google")).toEqual({
      default: "gemini-3-flash-preview",
      economy: "gemini-2.5-flash",
    });
  });
});
