import { SYSTEM_RULE_ORDER } from "@/utils/rule/consts";

type SortableRule = {
  enabled?: boolean | null;
  systemType?: string | null;
  name: string;
  instructions?: string | null;
};

export function sortRulesForAutomation<T extends SortableRule>(rules: T[]): T[] {
  return [...rules].sort((a, b) => {
    const enabledCompare = Number(Boolean(b.enabled)) - Number(Boolean(a.enabled));
    if (enabledCompare !== 0) return enabledCompare;

    const systemOrderCompare =
      getSystemRuleOrderIndex(a.systemType) - getSystemRuleOrderIndex(b.systemType);
    if (systemOrderCompare !== 0) return systemOrderCompare;

    const nameCompare = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (nameCompare !== 0) return nameCompare;

    return (a.instructions ?? "").localeCompare(b.instructions ?? "", undefined, {
      sensitivity: "base",
    });
  });
}

function getSystemRuleOrderIndex(systemType?: string | null) {
  if (!systemType) return SYSTEM_RULE_ORDER.length;
  const index = SYSTEM_RULE_ORDER.indexOf(
    systemType as (typeof SYSTEM_RULE_ORDER)[number],
  );
  return index === -1 ? SYSTEM_RULE_ORDER.length : index;
}
