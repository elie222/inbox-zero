import {
  type Action,
  type Rule,
  type Category,
  ActionType,
  type Prisma,
} from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { getEmailTerminology } from "@/utils/terminology";

const logger = createScopedLogger("ai/rule/create-prompt-from-rule");

export type RuleWithRelations = Rule & {
  actions: Action[];
  categoryFilters?: Category[];
  group?:
    | (Prisma.GroupGetPayload<{
        select: { id: true; name: true };
      }> & {
        items?:
          | Prisma.GroupItemGetPayload<{
              select: { id: true; type: true; value: true };
            }>[]
          | null;
      })
    | null;
};

export function createPromptFromRule(
  rule: RuleWithRelations,
  provider: string,
): string {
  const terminology = getEmailTerminology(provider);
  const conditions: string[] = [];
  const actions: string[] = [];

  // Add conditions based on rule type and fields
  if (rule.from) conditions.push(`from "${rule.from}"`);
  if (rule.to) conditions.push(`to "${rule.to}"`);
  if (rule.subject)
    conditions.push(`with subject containing "${rule.subject}"`);
  if (rule.body) conditions.push(`with body containing "${rule.body}"`);

  // Add category filters if present
  if (rule.categoryFilters?.length) {
    const categories = rule.categoryFilters.map((c) => c.name).join(", ");
    const filterType = rule.categoryFilterType === "INCLUDE" ? "in" : "not in";
    conditions.push(`from senders ${filterType} categories: ${categories}`);
  }

  // Add AI instructions if present
  if (rule.instructions) {
    conditions.push(`matching AI criteria: "${rule.instructions}"`);
  }

  // Process actions
  rule.actions.forEach((action) => {
    switch (action.type) {
      case ActionType.ARCHIVE:
        actions.push("archive");
        break;
      case ActionType.LABEL:
        if (action.label)
          actions.push(
            `${terminology.label.action.toLowerCase()} as "${action.label}"`,
          );
        break;
      case ActionType.REPLY:
        if (action.content) {
          const isTemplate = action.content.includes("{{");
          actions.push(
            isTemplate
              ? `send a templated reply: "${action.content}"`
              : `send a static reply: "${action.content}"`,
          );
        } else {
          actions.push("send a reply");
        }
        break;
      case ActionType.SEND_EMAIL:
        actions.push(`send email${action.to ? ` to ${action.to}` : ""}`);
        break;
      case ActionType.FORWARD:
        if (action.to) actions.push(`forward to ${action.to}`);
        break;
      case ActionType.DRAFT_EMAIL:
        actions.push("create a draft");
        break;
      case ActionType.MARK_SPAM:
        actions.push("mark as spam");
        break;
      case ActionType.CALL_WEBHOOK:
        if (action.url) actions.push(`call webhook at ${action.url}`);
        break;
      case ActionType.MARK_READ:
        actions.push("mark as read");
        break;
      case ActionType.TRACK_THREAD:
        break;
      case ActionType.DIGEST:
        actions.push("add to digest");
        break;
      case ActionType.MOVE_FOLDER:
        actions.push("move to folder");
        break;
      default:
        logger.warn("Unknown action type", { actionType: action.type });
        // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
        const exhaustiveCheck: never = action.type;
        return exhaustiveCheck;
    }
  });

  // Combine conditions with proper operator
  const operator = rule.conditionalOperator === "OR" ? " or " : " and ";
  const conditionText = conditions.length
    ? `For emails ${conditions.join(operator)}`
    : "For all emails";

  const actionText = actions.join(" and ");

  return `${conditionText}, ${actionText}`;
}
