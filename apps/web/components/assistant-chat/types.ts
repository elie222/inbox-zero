import type { UIMessage } from "ai";
import type {
  AddToKnowledgeBaseTool,
  CreateRuleTool,
  ForwardEmailTool,
  GetAccountOverviewTool,
  GetAssistantCapabilitiesTool,
  GetLearnedPatternsTool,
  GetUserRulesAndSettingsTool,
  ManageInboxTool,
  ReadEmailTool,
  ReplyEmailTool,
  SearchInboxTool,
  SaveMemoryTool,
  SearchMemoriesTool,
  SendEmailTool,
  UpdateAssistantSettingsTool,
  UpdateInboxFeaturesTool,
  UpdateAboutTool,
  UpdateLearnedPatternsTool,
  UpdateRuleActionsTool,
  UpdateRuleConditionsTool,
} from "@/utils/ai/assistant/chat";

// export type DataPart = { type: "append-message"; message: string };

// export const messageMetadataSchema = z.object({ createdAt: z.string() });

// export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = {
  getAssistantCapabilities: GetAssistantCapabilitiesTool;
  updateAssistantSettings: UpdateAssistantSettingsTool;
  getAccountOverview: GetAccountOverviewTool;
  searchInbox: SearchInboxTool;
  readEmail: ReadEmailTool;
  manageInbox: ManageInboxTool;
  updateInboxFeatures: UpdateInboxFeaturesTool;
  getUserRulesAndSettings: GetUserRulesAndSettingsTool;
  getLearnedPatterns: GetLearnedPatternsTool;
  createRule: CreateRuleTool;
  updateRuleConditions: UpdateRuleConditionsTool;
  updateRuleActions: UpdateRuleActionsTool;
  updateLearnedPatterns: UpdateLearnedPatternsTool;
  updateAbout: UpdateAboutTool;
  addToKnowledgeBase: AddToKnowledgeBaseTool;
  saveMemory: SaveMemoryTool;
  searchMemories: SearchMemoriesTool;
  sendEmail: SendEmailTool;
  replyEmail: ReplyEmailTool;
  forwardEmail: ForwardEmailTool;
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
