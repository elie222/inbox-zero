import { msg } from "@lingui/core/macro";
import { MeetingJoinRule } from "@/generated/prisma/enums";

export const JOIN_RULE_OPTIONS = [
  { value: MeetingJoinRule.ALL, label: msg`Every call with a video link` },
  {
    value: MeetingJoinRule.EXTERNAL_ONLY,
    label: msg`Only calls with people outside my company`,
  },
  { value: MeetingJoinRule.HOST_ONLY, label: msg`Only calls I organize` },
  { value: MeetingJoinRule.OFF, label: msg`Only the ones I turn on myself` },
];
