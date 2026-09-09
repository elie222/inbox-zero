import { MeetingJoinRule } from "@/generated/prisma/enums";

export const JOIN_RULE_OPTIONS = [
  { value: MeetingJoinRule.ALL, label: "Every call with a video link" },
  {
    value: MeetingJoinRule.EXTERNAL_ONLY,
    label: "Only calls with people outside my company",
  },
  { value: MeetingJoinRule.HOST_ONLY, label: "Only calls I organize" },
  { value: MeetingJoinRule.OFF, label: "Only the ones I turn on myself" },
];
