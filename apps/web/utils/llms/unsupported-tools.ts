import type { Tool } from "ai";
import { Provider } from "@/utils/llms/config";

const GROK_UNSUPPORTED_TOOL_NAMES = new Set(["updateAssistantSettings"]);

export function filterUnsupportedToolsForModel({
  provider,
  modelName,
  tools,
}: {
  provider: string;
  modelName: string;
  tools?: Record<string, Tool>;
}) {
  if (!tools) return { tools, excludedTools: [] as string[] };
  if (provider !== Provider.OPENROUTER)
    return { tools, excludedTools: [] as string[] };
  if (!isXaiGrokModel(modelName))
    return { tools, excludedTools: [] as string[] };

  const excludedTools = Object.keys(tools).filter((name) =>
    GROK_UNSUPPORTED_TOOL_NAMES.has(name),
  );
  if (excludedTools.length === 0)
    return { tools, excludedTools: [] as string[] };

  const supportedTools = Object.fromEntries(
    Object.entries(tools).filter(
      ([name]) => !GROK_UNSUPPORTED_TOOL_NAMES.has(name),
    ),
  ) as Record<string, Tool>;

  return { tools: supportedTools, excludedTools };
}

function isXaiGrokModel(modelName: string): boolean {
  return modelName.toLowerCase().startsWith("x-ai/grok-");
}
