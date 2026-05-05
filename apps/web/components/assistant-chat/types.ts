import type { UIMessage } from "ai";
import type { AddToKnowledgeBaseTool } from "@/utils/ai/assistant/tools/rules/add-to-knowledge-base-tool";
import type { CreateRuleTool } from "@/utils/ai/assistant/tools/rules/create-rule-tool";
import type { GetLearnedPatternsTool } from "@/utils/ai/assistant/tools/rules/get-learned-patterns-tool";
import type { GetRuleExecutionForMessageTool } from "@/utils/ai/assistant/tools/rules/get-rule-execution-for-message-tool";
import type { GetUserRulesAndSettingsTool } from "@/utils/ai/assistant/tools/rules/get-user-rules-and-settings-tool";
import type { UpdatePersonalInstructionsTool } from "@/utils/ai/assistant/tools/rules/update-personal-instructions-tool";
import type { UpdateLearnedPatternsTool } from "@/utils/ai/assistant/tools/rules/update-learned-patterns-tool";
import type { UpdateRuleTool } from "@/utils/ai/assistant/tools/rules/update-rule-tool";
import type { UpdateRuleStateTool } from "@/utils/ai/assistant/tools/rules/update-rule-state-tool";
import type { GetAssistantCapabilitiesTool } from "@/utils/ai/assistant/tools/settings/get-assistant-capabilities-tool";
import type { UpdateAssistantSettingsTool } from "@/utils/ai/assistant/tools/settings/update-assistant-settings-tool";
import type {
  ForwardEmailTool,
  GetAccountOverviewTool,
  GetSenderCategorizationStatusTool,
  GetSenderCategoryOverviewTool,
  ManageInboxTool,
  ManageSenderCategoryTool,
  ReadAttachmentTool,
  ReadEmailTool,
  ReplyEmailTool,
  SearchInboxTool,
  SendEmailTool,
  StartSenderCategorizationTool,
} from "@/utils/ai/assistant/chat-inbox-tools";
import type {
  SaveMemoryTool,
  SearchMemoriesTool,
} from "@/utils/ai/assistant/chat-memory-tools";
import type { GetCalendarEventsTool } from "@/utils/ai/assistant/chat-calendar-tools";

// export type DataPart = { type: "append-message"; message: string };

// export const messageMetadataSchema = z.object({ createdAt: z.string() });

// export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = {
  getAssistantCapabilities: GetAssistantCapabilitiesTool;
  updateAssistantSettings: UpdateAssistantSettingsTool;
  getAccountOverview: GetAccountOverviewTool;
  getSenderCategoryOverview: GetSenderCategoryOverviewTool;
  startSenderCategorization: StartSenderCategorizationTool;
  getSenderCategorizationStatus: GetSenderCategorizationStatusTool;
  manageSenderCategory: ManageSenderCategoryTool;
  searchInbox: SearchInboxTool;
  readEmail: ReadEmailTool;
  manageInbox: ManageInboxTool;
  getUserRulesAndSettings: GetUserRulesAndSettingsTool;
  getRuleExecutionForMessage: GetRuleExecutionForMessageTool;
  getLearnedPatterns: GetLearnedPatternsTool;
  createRule: CreateRuleTool;
  updateRule: UpdateRuleTool;
  updateRuleState: UpdateRuleStateTool;
  updateLearnedPatterns: UpdateLearnedPatternsTool;
  updatePersonalInstructions: UpdatePersonalInstructionsTool;
  addToKnowledgeBase: AddToKnowledgeBaseTool;
  saveMemory: SaveMemoryTool;
  searchMemories: SearchMemoriesTool;
  sendEmail: SendEmailTool;
  replyEmail: ReplyEmailTool;
  forwardEmail: ForwardEmailTool;
  getCalendarEvents: GetCalendarEventsTool;
  readAttachment: ReadAttachmentTool;
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
