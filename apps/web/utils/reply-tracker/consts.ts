export const NEEDS_REPLY_LABEL_NAME = "To Reply";
export const AWAITING_REPLY_LABEL_NAME = "Awaiting Reply";

export const defaultReplyTrackerInstructions = `Apply this to emails needing my direct response. Exclude:
- All automated notifications (LinkedIn, Facebook, GitHub, social media, marketing)
- System emails (order confirmations, calendar invites)

Match only when someone:
- Asks me a direct question
- Requests information or action
- Needs my specific input
- Follows up on a conversation

When an email matches both this rule and others, prioritize this one.`;
