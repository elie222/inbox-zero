import {
  createOrGetFolderTool,
  listFoldersTool,
  moveThreadsToFolderTool,
} from "./chat-folder-tools";
import { microsoftChatProviderConfig } from "./chat-provider-microsoft";
import type { AssistantChatProviderConfig } from "./chat-provider-shared";

export const icloudChatProviderConfig: AssistantChatProviderConfig = {
  taxonomy: {
    ...microsoftChatProviderConfig.taxonomy,
    actionVerb: "move to folder",
    noun: "folder",
    entity: "folder",
    plural: "folders",
    scopePlural: "folders",
    hiddenIdName: "folderId",
  },
  searchSyntaxPolicy: "",
  inboxTriagePolicy: "",
  getTaxonomyTools: (options) => ({
    listFolders: listFoldersTool(options),
    createOrGetFolder: createOrGetFolderTool(options),
    moveThreadsToFolder: moveThreadsToFolderTool(options),
  }),
};
