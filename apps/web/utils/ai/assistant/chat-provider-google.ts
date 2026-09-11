import { createOrGetLabelTool, listLabelsTool } from "./chat-label-tools";
import type { AssistantChatProviderConfig } from "./chat-provider-shared";

export const googleChatProviderConfig: AssistantChatProviderConfig = {
  taxonomy: {
    actionVerb: "label",
    noun: "label",
    entity: "label",
    plural: "labels",
    scopePlural: "labels",
    hiddenIdName: "labelId",
    ruleCardActionEncoding:
      "the label in label, boolean actions in archive/draft/markread, the notification provider in notify, and use do only for an action that cannot be represented by those attributes",
  },
  searchSyntaxPolicy: `Provider search syntax:
- Use Gmail search syntax: from:, to:, subject:, in:inbox, is:unread, has:attachment, after:YYYY/MM/DD, before:YYYY/MM/DD, label:, newer_than:, and older_than:.`,
  inboxTriagePolicy: `Provider inbox defaults:
- For inbox triage, default to \`is:unread\` unless the user asks to include read messages.
- For reply triage, do not rely only on unread; include reply-needed signals like \`label:"To Reply"\` when helpful.
- For retroactive cleanup sampling, category filters like \`category:promotions\`, \`category:updates\`, or \`category:social\` are useful.`,
  getTaxonomyTools: (options) => ({
    listLabels: listLabelsTool(options),
    createOrGetLabel: createOrGetLabelTool(options),
  }),
};
