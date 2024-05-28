import { type CreateRuleBody } from "@/utils/actions/validation";
import { AI_GENERATED_FIELD_VALUE } from "@/utils/config";
import { ActionType, RuleType } from "@prisma/client";
import {
  ForwardIcon,
  ShieldAlertIcon,
  MailQuestionIcon,
  NewspaperIcon,
  CalendarIcon,
  PresentationIcon,
} from "lucide-react";

export const RECEIPT_GROUP_ID = "RECEIPT";
export const NEWSLETTER_GROUP_ID = "NEWSLETTER";

export const examples: {
  title: string;
  icon: React.ReactNode;
  rule: CreateRuleBody;
  automate?: boolean;
  runOnThreads?: boolean;
}[] = [
  {
    title: "Forward receipts",
    icon: <ForwardIcon className="h-4 w-4" />,
    rule: {
      name: "Forward receipts",
      actions: [{ type: ActionType.FORWARD, to: "alice@accountant.com" }],
      instructions: "Forward receipts to alice@accountant.com.",
      type: RuleType.GROUP,
      groupId: RECEIPT_GROUP_ID,
    },
  },
  {
    title: "Archive and label newsletters",
    icon: <NewspaperIcon className="h-4 w-4" />,
    rule: {
      name: "Archive and label newsletters",
      actions: [
        { type: ActionType.ARCHIVE },
        { type: ActionType.LABEL, label: "Newsletter" },
      ],
      instructions: "Archive newsletters and label them as 'Newsletter'.",
      type: RuleType.GROUP,
      groupId: NEWSLETTER_GROUP_ID,
    },
  },
  {
    title: "Label high priority emails",
    icon: <ShieldAlertIcon className="h-4 w-4" />,
    rule: {
      name: "Label high priority emails",
      actions: [{ type: ActionType.LABEL, label: "High Priority" }],
      instructions: `Mark high priority emails as "High Priority". Examples include:
* Customer wants to cancel their plan
* Customer wants to purchase
* Customer complaint`,
      type: RuleType.AI,
    },
  },
  {
    title: "Respond to common question",
    icon: <MailQuestionIcon className="h-4 w-4" />,
    rule: {
      name: "Respond to question",
      actions: [
        {
          type: ActionType.REPLY,
          content: "Hey, our premium plan is $10 per month!",
        },
      ],
      instructions:
        "If someone asks how much the premium plan is, respond: 'Our premium plan is $10 per month.'",
      type: RuleType.AI,
    },
  },
  {
    title: "Draft a response to set a meeting",
    icon: <CalendarIcon className="h-4 w-4" />,
    rule: {
      name: "Draft meeting response",
      actions: [
        {
          type: ActionType.DRAFT_EMAIL,
          content: AI_GENERATED_FIELD_VALUE,
        },
      ],
      instructions:
        "If someone asks to book a meeting, draft a response with my calendar booking link: https://cal.com/me/call",
      type: RuleType.AI,
      automate: true,
      runOnThreads: true,
    },
  },
  {
    title: "Label founder pitch decks",
    icon: <PresentationIcon className="h-4 w-4" />,
    rule: {
      name: "Label founder pitch decks",
      actions: [
        {
          type: ActionType.LABEL,
          content: "Pitch",
        },
      ],
      instructions: "Label founder pitch decks as 'Pitch'.",
      type: RuleType.AI,
      automate: true,
      runOnThreads: true,
    },
  },
];
