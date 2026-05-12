import type { ToolSet } from "ai";
import type { Logger } from "@/utils/logger";
import type { RuleReadState } from "./chat-rule-state";
import { googleChatProviderConfig } from "./chat-provider-google";
import { microsoftChatProviderConfig } from "./chat-provider-microsoft";

type ChatToolOptions = {
  email: string;
  emailAccountId: string;
  userId: string;
  provider: string;
  logger: Logger;
  setRuleReadState: (state: RuleReadState) => void;
  getRuleReadState: () => RuleReadState | null;
  onRulesStateExposed?: (rulesRevision: number) => void;
};

type ChatProviderTaxonomy = {
  actionVerb: string;
  noun: string;
  entity: string;
  plural: string;
  scopePlural: string;
  hiddenIdName: string;
  ruleCardActionEncoding: string;
};

export type AssistantChatProviderConfig = {
  taxonomy: ChatProviderTaxonomy;
  searchSyntaxPolicy: string;
  inboxTriagePolicy: string;
  getTaxonomyTools: (options: ChatToolOptions) => ToolSet;
};

export type AssistantChatProvider = AssistantChatProviderConfig & {
  threadActionPolicy: string;
  missingContextPolicy: string;
  ruleSuggestionPolicy: string;
  hiddenTaxonomyIdName: string;
};

const providerPolicies: Record<string, AssistantChatProvider> = {
  google: buildAssistantChatProvider(googleChatProviderConfig),
  microsoft: buildAssistantChatProvider(microsoftChatProviderConfig),
};

export function getAssistantChatProvider(
  provider: string,
): AssistantChatProvider {
  return providerPolicies[provider] ?? providerPolicies.google;
}

function buildAssistantChatProvider(
  config: AssistantChatProviderConfig,
): AssistantChatProvider {
  return {
    ...config,
    threadActionPolicy: `archive, trash, ${config.taxonomy.actionVerb}, mark read`,
    missingContextPolicy: `If ${config.taxonomy.scopePlural} are missing`,
    ruleSuggestionPolicy: buildRuleSuggestionPolicy(config.taxonomy),
    hiddenTaxonomyIdName: config.taxonomy.hiddenIdName,
  };
}

function buildRuleSuggestionPolicy(taxonomy: ChatProviderTaxonomy) {
  return `Rule suggestions:
- When the user asks for rules to add, call getUserRulesAndSettings first, then inspect enough inbox evidence to find recurring patterns; avoid duplicates.
- Suggest only high-value recurring patterns that save time, reduce repeated decisions, or protect important messages. Skip one-off or short-lived patterns unless the user asks to automate them.
- Treat existing ${taxonomy.scopePlural} as context, not a constraint. If a pattern deserves its own workflow, suggest a clear new ${taxonomy.entity}; do not squeeze it into a broad existing ${taxonomy.entity} just because it already exists.
- Each suggested action must materially change what happens to those emails. Avoid ${taxonomy.noun}-only rules for low-priority mail; pair low-priority ${taxonomy.plural} with archive, mark read, or skip the suggestion. Do not draft replies for broad support ${taxonomy.plural} unless the evidence shows a repeatable standard response.
- Do not group unrelated platforms or vendors into one rule just because they are alerts. Only combine senders when the same action is safe for all of them; messages about failures, submissions, billing, security, or customer impact usually need more careful handling than archive-as-notification.
- Keep it short and human: choose a final set of 2-3 rules when the inbox shows multiple strong recurring patterns; choose only 1 when there is truly only one high-confidence opportunity. Avoid spec-style headings like "Condition", "Action", "Evidence", or "Why these?".
- Choose actions and ${taxonomy.scopePlural} that match the workflow, and use broad ${taxonomy.scopePlural} only when they genuinely fit.
- For notification actions, set notify to the exact provider name from ruleNotificationDestinations. If no destination is listed, do not include notify; ask which destination to use instead. Never say "chat app".
- Use <rule-suggestions> with exactly one self-contained <rule-suggestion /> for each rule in that final set. Put the condition in when, ${taxonomy.ruleCardActionEncoding}. These render as rule cards. Do not mention additional rule ideas outside the cards.
- Ask one focused calibration question when priority/action is unclear, especially about important messages that should be protected or surfaced. The question should refine the next step, not replace high-confidence rule cards.
- Do not create a rule until the user confirms the exact rule and action.`;
}
