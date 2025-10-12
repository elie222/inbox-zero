import type { Rule, Action } from "@prisma/client";
import {
  ActionType,
  CategoryFilterType,
  LogicalOperator,
} from "@prisma/client";

export interface RuleWithActions extends Rule {
  actions: Action[];
  categoryFilters?: { name: string }[];
  group?: { name: string } | null;
}

export function ruleToText(rule: RuleWithActions): string {
  const conditions: string[] = [];
  const actions: string[] = [];

  // Build conditions
  if (rule.instructions) {
    conditions.push(rule.instructions);
  }

  if (rule.from) {
    conditions.push(`'From' contains "${rule.from}"`);
  }

  if (rule.to) {
    conditions.push(`'To' contains "${rule.to}"`);
  }

  if (rule.subject) {
    conditions.push(`'Subject' contains "${rule.subject}"`);
  }

  if (rule.body) {
    conditions.push(`'Body' contains "${rule.body}"`);
  }

  // if (rule.group) {
  //   conditions.push(`Sender is in group "${rule.group.name}"`);
  // }

  if (rule.categoryFilterType && rule.categoryFilters?.length) {
    const categoryNames = rule.categoryFilters.map((c) => c.name).join(", ");
    if (rule.categoryFilterType === CategoryFilterType.INCLUDE) {
      conditions.push(`Sender is in categories: ${categoryNames}`);
    } else {
      conditions.push(`Sender is NOT in categories: ${categoryNames}`);
    }
  }

  // Build actions
  rule.actions.forEach((action) => {
    switch (action.type) {
      case ActionType.ARCHIVE:
        actions.push("Archive");
        break;
      case ActionType.LABEL:
        if (action.label) {
          actions.push(`Label as @[${action.label}]`);
        }
        break;
      case ActionType.REPLY:
        if (action.content) {
          actions.push(`Reply with: "${action.content}"`);
        } else {
          actions.push("Send reply");
        }
        break;
      case ActionType.FORWARD:
        if (action.to) {
          actions.push(`Forward to ${action.to}`);
        }
        break;
      case ActionType.SEND_EMAIL:
        actions.push(`Send email${action.to ? ` to ${action.to}` : ""}`);
        break;
      case ActionType.DRAFT_EMAIL:
        actions.push("Draft a reply");
        break;
      case ActionType.MARK_SPAM:
        actions.push("Mark as spam");
        break;
      case ActionType.MARK_READ:
        actions.push("Mark as read");
        break;
      case ActionType.CALL_WEBHOOK:
        if (action.url) {
          actions.push(`Call webhook: ${action.url}`);
        }
        break;
      case ActionType.DIGEST:
        actions.push("Add to digest");
        break;
      case ActionType.MOVE_FOLDER:
        if (action.folderName) {
          actions.push(`Move to folder "${action.folderName}"`);
        }
        break;
    }
  });

  // Combine conditions with operator
  const operator =
    rule.conditionalOperator === LogicalOperator.OR ? " OR " : " AND ";
  const conditionText =
    conditions.length > 0
      ? conditions.join(operator)
      : "No conditions specified";

  // Format the output with actions as bullet list
  const actionsText =
    actions.length > 0
      ? actions.map((action) => `- ${action}`).join("\n")
      : "- No actions specified";

  return `**When:**\n\n${conditionText}\n\n**Then:**\n${actionsText}`;
}
