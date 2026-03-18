import type {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";

export type DraftContextMetadata = {
  replyMemories: {
    count: number;
    ids: string[];
    kinds: ReplyMemoryKind[];
    scopeTypes: ReplyMemoryScopeType[];
  };
  knowledgeBase: {
    availableCount: number;
    injected: boolean;
  };
  senderHistory: {
    summaryInjected: boolean;
    summarySourceMessageCount: number;
    precedentThreadsInjected: boolean;
    precedentThreadCount: number;
  };
  calendar: {
    injected: boolean;
    noAvailability: boolean;
    suggestedTimesCount: number;
  };
  writingStyle: {
    custom: boolean;
  };
  externalTools: {
    injected: boolean;
  };
  meetings: {
    injected: boolean;
    count: number;
  };
  attachments: {
    injected: boolean;
    selectedCount: number;
  };
};
