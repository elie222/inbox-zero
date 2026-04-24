import type { Tool } from "ai";

const INTERNAL_TOOL_NAMES = new Set(["updateAssistantSettingsCompat"]);

export function filterUnsupportedToolsForModel({
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

  return {
    tools: candidateTools,
    excludedTools: [] as string[],
    replacedTools: [] as string[],
  };
}
