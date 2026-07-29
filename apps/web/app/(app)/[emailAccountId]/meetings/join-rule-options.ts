import { MeetingJoinRule } from "@/generated/prisma/enums";

type JoinRuleOption = {
  value: MeetingJoinRule;
  label: string;
  description: string;
  recommended?: boolean;
};

export const JOIN_RULE_OPTIONS: JoinRuleOption[] = [
  {
    value: MeetingJoinRule.EXTERNAL_ONLY,
    label: "Meetings with guests",
    description: "Join calls that include someone outside your company",
    recommended: true,
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
];
