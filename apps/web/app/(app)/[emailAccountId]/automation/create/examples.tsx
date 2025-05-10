import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { ActionType } from "@prisma/client";
import { ConditionType } from "@/utils/config";
import {
  ForwardIcon,
  ShieldAlertIcon,
  MailQuestionIcon,
  NewspaperIcon,
  CalendarIcon,
  PresentationIcon,
} from "lucide-react";

export const examples: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rule: CreateRuleBody;
  automate?: boolean;
  runOnThreads?: boolean;
}[] = [
  {
    title: "Forward receipts",
    description: "Forward receipts to alice@accountant.com.",
    icon: <ForwardIcon className="h-4 w-4" />,
    rule: {
      name: "Forward receipts",
      conditions: [
        {
          type: ConditionType.AI,
          instructions: "Forward receipts to alice@accountant.com.",
        },
      ],
      actions: [
        { type: ActionType.FORWARD, to: { value: "alice@accountant.com" } },
      ],
    },
  },
  {
    title: "Archive and label newsletters",
    description: "Archive newsletters and label them as 'Newsletter'.",
    icon: <NewspaperIcon className="h-4 w-4" />,
    rule: {
      name: "Archive and label newsletters",
      conditions: [
        {
          type: ConditionType.AI,
          instructions: "Archive newsletters and label them as 'Newsletter'.",
        },
      ],
      actions: [
        { type: ActionType.ARCHIVE },
        { type: ActionType.LABEL, label: { value: "Newsletter" } },
      ],
    },
  },
  {
    title: "Label high priority emails",
    description: `Label high priority emails as "High Priority"`,
    icon: <ShieldAlertIcon className="h-4 w-4" />,
    rule: {
      name: "Label high priority emails",
      conditions: [
        {
          type: ConditionType.AI,
          instructions: `Mark high priority emails as "High Priority". Examples include:
* Customer wants to cancel their plan
* Customer wants to purchase
* Customer complaint`,
        },
      ],
      actions: [{ type: ActionType.LABEL, label: { value: "High Priority" } }],
    },
  },
  {
    title: "Respond to common question",
    description:
      "If someone asks how much the premium plan is, respond: 'Our premium plan is $10 per month.'",
    icon: <MailQuestionIcon className="h-4 w-4" />,
    rule: {
      name: "Respond to question",
      conditions: [
        {
          type: ConditionType.AI,
          instructions:
            "If someone asks how much the premium plan is, respond: 'Our premium plan is $10 per month.'",
        },
      ],
      actions: [
        {
          type: ActionType.REPLY,
          content: { value: "Hey, our premium plan is $10 per month!" },
        },
      ],
    },
  },
  {
    title: "Draft a response to set a meeting",
    description: "Select this rule when someone asks to book a meeting.",
    icon: <CalendarIcon className="h-4 w-4" />,
    rule: {
      name: "Draft meeting response",
      conditions: [
        {
          type: ConditionType.AI,
          instructions: "Select this rule when someone asks to book a meeting.",
        },
      ],
      actions: [
        {
          type: ActionType.DRAFT_EMAIL,
          content: {
            value:
              "Draft a response with my calendar booking link: https://cal.com/me/call",
            ai: true,
          },
        },
      ],
      automate: true,
      runOnThreads: true,
    },
  },
  {
    title: "Label founder pitch decks",
    description: "Label founder pitch decks as 'Pitch'.",
    icon: <PresentationIcon className="h-4 w-4" />,
    rule: {
      name: "Label founder pitch decks",
      conditions: [
        {
          type: ConditionType.AI,
          instructions: "Label founder pitch decks as 'Pitch'.",
        },
      ],
      actions: [
        {
          type: ActionType.LABEL,
          content: { value: "Pitch" },
        },
      ],
      automate: true,
      runOnThreads: true,
    },
  },
];
