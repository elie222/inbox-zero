import {
  createOrGetCategoryTool,
  listCategoriesTool,
} from "./chat-label-tools";
import type { AssistantChatProviderConfig } from "./chat-provider-shared";

export const microsoftChatProviderConfig: AssistantChatProviderConfig = {
  taxonomy: {
    actionVerb: "categorize",
    noun: "category",
    entity: "category or folder",
    plural: "categories",
    scopePlural: "categories and folders",
    hiddenIdName: "categoryId",
    ruleCardActionEncoding:
      "boolean actions in archive/draft/markread, the notification provider in notify, and use do for category/folder actions or any action that cannot be represented by those attributes",
  },
  searchSyntaxPolicy: `Provider search syntax:
- Use Outlook search syntax with keyword search, unread/read, and simple subject: filters.
- Prefer a plain sender email like \`person@example.com\` over \`from:\` when searching by sender.
- If you use \`from:\` or \`to:\`, keep it as a simple standalone filter instead of combining extra terms after the field value.
- Keep Outlook queries to one simple clause whenever possible. Do not mix sender, unread/read, date, and subject constraints into one retry.
- Use searchInbox structured fields for category/folder scope and read state; use query for sender, subject, body text, or date/age filters.
- Do not use Gmail-specific operators.`,
  inboxTriagePolicy: `Provider inbox defaults:
- For inbox triage summaries, include the literal token \`unread\` in the query unless the user asks to include read messages. Do not add unread/read to direct cleanup action searches unless the user asks for that read state.
- For reply triage, use plain reply-focused search terms like \`reply OR respond OR subject:"question" OR subject:"approval"\`. Do not use Gmail-only operators.
- For retroactive cleanup sampling, keyword queries like "newsletter", "promotion", or "unsubscribe" are useful.`,
  getTaxonomyTools: (options) => ({
    listCategories: listCategoriesTool(options),
    createOrGetCategory: createOrGetCategoryTool(options),
  }),
};
