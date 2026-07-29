import { MeetingJoinRule } from "@/generated/prisma/enums";

export const JOIN_RULE_OPTIONS = [
  {
    value: MeetingJoinRule.EXTERNAL_ONLY,
    label: "Meetings with guests",
    description: "Join calls that include someone outside your company",
  },
  {
    value: MeetingJoinRule.ALL,
    label: "All meetings",
    description: "Join every call on your calendar with a video link",
  },
  {
    value: MeetingJoinRule.HOST_ONLY,
    label: "Meetings I organize",
    description: "Only join calls where you are the organizer",
  },
  {
    value: MeetingJoinRule.OFF,
    label: "Nothing automatic",
    description: "Only join calls you turn on one by one",
  },
] as const;

export function getJoinRuleOption(rule: MeetingJoinRule) {
  return (
    JOIN_RULE_OPTIONS.find((option) => option.value === rule) ??
    JOIN_RULE_OPTIONS[0]
  );
}
