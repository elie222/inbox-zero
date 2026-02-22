import { describe, expect, it } from "vitest";
import { formatToolLabel } from "./tool-label";

describe("formatToolLabel", () => {
  it("formats camelCase tool names", () => {
    expect(formatToolLabel("tool-updateAssistantSettings")).toBe(
      "update assistant settings",
    );
  });

  it("formats snake_case tool names", () => {
    expect(formatToolLabel("tool-search_memories")).toBe("search memories");
  });

  it("formats kebab-case tool names", () => {
    expect(formatToolLabel("tool-send-email")).toBe("send email");
  });
});
