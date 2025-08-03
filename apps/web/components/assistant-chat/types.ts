import type { UIMessage } from "ai";
import type {
  AddToKnowledgeBaseTool,
  CreateRuleTool,
  GetLearnedPatternsTool,
  GetUserRulesAndSettingsTool,
  UpdateAboutTool,
  UpdateLearnedPatternsTool,
  UpdateRuleActionsTool,
  UpdateRuleConditionsTool,
} from "@/utils/ai/assistant/chat";

export type SetInputFunction = React.Dispatch<React.SetStateAction<string>>;

// export type DataPart = { type: "append-message"; message: string };

// export const messageMetadataSchema = z.object({ createdAt: z.string() });

// export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = {
  getUserRulesAndSettings: GetUserRulesAndSettingsTool;
  getLearnedPatterns: GetLearnedPatternsTool;
  createRule: CreateRuleTool;
  updateRuleConditions: UpdateRuleConditionsTool;
  updateRuleActions: UpdateRuleActionsTool;
  updateLearnedPatterns: UpdateLearnedPatternsTool;
  updateAbout: UpdateAboutTool;
  addToKnowledgeBase: AddToKnowledgeBaseTool;
};

// biome-ignore lint/complexity/noBannedTypes: ignore
export type CustomUIDataTypes = {
  // textDelta: string;
  // // suggestion: Suggestion;
  // appendMessage: string;
  // id: string;
  // title: string;
  // clear: null;
  // finish: null;
  // ruleId: string | null;
};

export type ChatMessage = UIMessage<
  // biome-ignore lint/complexity/noBannedTypes: ignore
  {}, // MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;
