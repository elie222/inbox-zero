import type { Tool } from "ai";
import { Provider } from "@/utils/llms/config";

const GROK_TOOL_REPLACEMENTS: Record<string, string> = {
  updateAssistantSettings: "updateAssistantSettingsCompat",
};

const INTERNAL_TOOL_NAMES = new Set(Object.values(GROK_TOOL_REPLACEMENTS));

export function filterUnsupportedToolsForModel({
  provider,
  modelName,
  tools,
}: {
  provider: string;
  modelName: string;
  tools?: Record<string, Tool>;
}) {
  if (!tools) {
    return {
      tools,
      excludedTools: [] as string[],
      replacedTools: [] as string[],
    };
  }

  const candidateTools = { ...tools };

  for (const internalToolName of INTERNAL_TOOL_NAMES) {
    delete candidateTools[internalToolName];
  }

  if (provider !== Provider.OPENROUTER || !isXaiGrokModel(modelName)) {
    return {
      tools: candidateTools,
      excludedTools: [] as string[],
      replacedTools: [] as string[],
    };
  }

  const replacedTools: string[] = [];
  const excludedTools: string[] = [];

  for (const [toolName, replacementToolName] of Object.entries(
    GROK_TOOL_REPLACEMENTS,
  )) {
    if (!(toolName in candidateTools)) continue;

    const replacementTool = tools[replacementToolName];
    if (replacementTool) {
      candidateTools[toolName] = replacementTool;
      replacedTools.push(toolName);
      continue;
    }

    delete candidateTools[toolName];
    excludedTools.push(toolName);
  }

  return {
    tools: candidateTools,
    excludedTools,
    replacedTools,
  };
}

function isXaiGrokModel(modelName: string): boolean {
  return modelName.toLowerCase().startsWith("x-ai/grok-");
}
