"use client";

import { RadioCardGroup } from "@/components/RadioCardGroup";
import type { MeetingJoinRule } from "@/generated/prisma/enums";
import { JOIN_RULE_OPTIONS } from "@/app/(app)/[emailAccountId]/meetings/join-rule-options";

const OPTIONS = JOIN_RULE_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
  description: option.description,
  badge: option.recommended ? "Recommended" : undefined,
}));

// Owns the mapping and the group's name/label so the setup screen and the
// settings dialog present the same choice.
export function JoinRuleChooser({
  value,
  onChange,
  disabled,
}: {
  value: MeetingJoinRule;
  onChange: (rule: MeetingJoinRule) => void;
  disabled?: boolean;
}) {
  return (
    <RadioCardGroup
      name="joinRule"
      ariaLabel="Which meetings to join"
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={OPTIONS}
    />
  );
}
