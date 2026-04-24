import type { Tool } from "ai";
import { describe, expect, it } from "vitest";
import { Provider } from "@/utils/llms/config";
import { filterUnsupportedToolsForModel } from "./unsupported-tools";

describe("filterUnsupportedToolsForModel", () => {
  it("removes internal compat tool for OpenRouter Grok models", () => {
    const primaryTool = {} as Tool;
    const compatTool = {} as Tool;
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: primaryTool,
      updateAssistantSettingsCompat: compatTool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "x-ai/grok-4.1-fast",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.replacedTools).toEqual([]);
    expect(result.tools).toEqual({
      searchInbox: tools.searchInbox,
      updateAssistantSettings: primaryTool,
    });
  });

  it("removes internal compat tool for non-Grok OpenRouter models", () => {
    const primaryTool = {} as Tool;
    const compatTool = {} as Tool;
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: primaryTool,
      updateAssistantSettingsCompat: compatTool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "anthropic/claude-sonnet-4.5",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.replacedTools).toEqual([]);
    expect(result.tools).toEqual({
      searchInbox: tools.searchInbox,
      updateAssistantSettings: primaryTool,
    });
  });

  it("keeps primary updateAssistantSettings for mixed-case Grok model names", () => {
    const primaryTool = {} as Tool;
    const compatTool = {} as Tool;
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: primaryTool,
      updateAssistantSettingsCompat: compatTool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "X-AI/GROK-4.1-fast",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.replacedTools).toEqual([]);
    expect(result.tools).toEqual({
      searchInbox: tools.searchInbox,
      updateAssistantSettings: primaryTool,
    });
  });

  it("keeps updateAssistantSettings for Grok when compat tool is unavailable", () => {
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: {} as Tool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPENROUTER,
      modelName: "x-ai/grok-4.1-fast",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.replacedTools).toEqual([]);
    expect(result.tools).toEqual({
      searchInbox: tools.searchInbox,
      updateAssistantSettings: tools.updateAssistantSettings,
    });
  });

  it("keeps all tools for non-OpenRouter providers", () => {
    const primaryTool = {} as Tool;
    const compatTool = {} as Tool;
    const tools = {
      searchInbox: {} as Tool,
      updateAssistantSettings: primaryTool,
      updateAssistantSettingsCompat: compatTool,
    };

    const result = filterUnsupportedToolsForModel({
      provider: Provider.OPEN_AI,
      modelName: "gpt-5",
      tools,
    });

    expect(result.excludedTools).toEqual([]);
    expect(result.replacedTools).toEqual([]);
    expect(result.tools).toEqual({
      searchInbox: tools.searchInbox,
      updateAssistantSettings: primaryTool,
    });
  });
});
