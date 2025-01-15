import type { Action, Rule, Category, Group } from "@prisma/client";

type RuleWithRelations = Rule & {
  actions: Action[];
  categoryFilters?: Category[];
  group?: Group | null;
};

export function generatePromptFromRule(rule: RuleWithRelations): string {
  const conditions: string[] = [];
  const actions: string[] = [];

  // Add conditions based on rule type and fields
  if (rule.from) conditions.push(`from "${rule.from}"`);
  if (rule.to) conditions.push(`to "${rule.to}"`);
  if (rule.subject)
    conditions.push(`with subject containing "${rule.subject}"`);
  if (rule.body) conditions.push(`with body containing "${rule.body}"`);

  // Add group if present
  if (rule.group?.name) {
    conditions.push(`in group "${rule.group.name}"`);
  }

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
      case "ARCHIVE":
        actions.push("archive");
        break;
      case "LABEL":
        if (action.label) actions.push(`label as "${action.label}"`);
        break;
      case "REPLY":
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
      case "SEND_EMAIL":
        actions.push(`send email${action.to ? ` to ${action.to}` : ""}`);
        break;
      case "FORWARD":
        if (action.to) actions.push(`forward to ${action.to}`);
        break;
      case "DRAFT_EMAIL":
        actions.push("create a draft");
        break;
      case "MARK_SPAM":
        actions.push("mark as spam");
        break;
      case "CALL_WEBHOOK":
        if (action.url) actions.push(`call webhook at ${action.url}`);
        break;
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

// export function generatePromptFromRules(rules: RuleWithRelations[]): string {
//   return rules.map((rule) => `* ${generatePromptFromRule(rule)}.`).join("\n");
// }
