import type { Tool } from "ai";
import { describe, expect, it } from "vitest";
import { Provider } from "@/utils/llms/config";
import { filterUnsupportedToolsForModel } from "./unsupported-tools";

describe("filterUnsupportedToolsForModel", () => {
  it("excludes updateAssistantSettings for OpenRouter Grok models", () => {
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: {} as Tool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "x-ai/grok-4.1-fast",
      tools,
    });

    expect(result.excludedTools).toEqual(["updateAssistantSettings"]);
    expect(Object.keys(result.tools || {})).toEqual(["searchInbox"]);
  });

  it("keeps all tools for non-Grok OpenRouter models", () => {
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: {} as Tool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "anthropic/claude-sonnet-4.5",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.tools).toBe(tools);
  });

  it("excludes updateAssistantSettings for mixed-case Grok model names", () => {
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: {} as Tool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "X-AI/GROK-4.1-fast",
      tools,
    });

    expect(result.excludedTools).toEqual(["updateAssistantSettings"]);
    expect(Object.keys(result.tools || {})).toEqual(["searchInbox"]);
  });

  it("keeps all tools for non-OpenRouter providers", () => {
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: {} as Tool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPEN_AI,
      modelName: "gpt-5",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.tools).toBe(tools);
  });
});
