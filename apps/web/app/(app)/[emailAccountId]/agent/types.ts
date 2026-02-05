import type { UIMessage } from "ai";
import type {
  SearchEmailsTool,
  GetEmailTool,
  ModifyEmailsTool,
  DraftReplyTool,
  SendEmailTool,
  GetSkillTool,
  CreateSkillTool,
  UpdateSkillTool,
  CreatePatternTool,
  RemovePatternTool,
  GetSettingsTool,
  UpdateSettingsTool,
  ShowSetupPreviewTool,
  BulkArchiveTool,
} from "@/utils/ai/agent/tools";

export type AgentChatTools = {
  searchEmails: SearchEmailsTool;
  getEmail: GetEmailTool;
  modifyEmails: ModifyEmailsTool;
  draftReply: DraftReplyTool;
  sendEmail: SendEmailTool;
  getSkill: GetSkillTool;
  createSkill: CreateSkillTool;
  updateSkill: UpdateSkillTool;
  createPattern: CreatePatternTool;
  removePattern: RemovePatternTool;
  getSettings: GetSettingsTool;
  updateSettings: UpdateSettingsTool;
  showSetupPreview: ShowSetupPreviewTool;
  bulkArchive: BulkArchiveTool;
};

type EmptyObject = Record<string, never>;

export type AgentChatMessage = UIMessage<
  EmptyObject,
  EmptyObject,
  AgentChatTools
>;
