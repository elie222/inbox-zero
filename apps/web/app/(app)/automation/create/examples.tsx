import { type CreateRuleBody } from "@/utils/actions/validation";
import {
  ForwardIcon,
  ShieldAlertIcon,
  MailQuestionIcon,
  NewspaperIcon,
} from "lucide-react";

export const RECEIPT_GROUP_ID = "RECEIPT";
export const NEWSLETTER_GROUP_ID = "NEWSLETTER";

export const examples: {
  title: string;
  description: string;
  icon: React.ReactNode;
  rule: CreateRuleBody;
}[] = [
  {
    title: "Forward receipts",
    description: "Forward receipts to alice@accountant.com.",
    icon: <ForwardIcon className="h-4 w-4" />,
    rule: {
      name: "Forward receipts",
      actions: [{ type: "FORWARD", to: "alice@accountant.com" }],
      instructions: "Forward receipts to alice@accountant.com.",
      type: "GROUP",
      groupId: RECEIPT_GROUP_ID,
    },
  },
  {
    title: "Archive and label newsletters",
    description: `Archive newsletters and label them as "Newsletter".`,
    icon: <NewspaperIcon className="h-4 w-4" />,
    rule: {
      name: "Archive and label newsletters",
      actions: [{ type: "ARCHIVE" }, { type: "LABEL", label: "Newsletter" }],
      instructions: "Archive newsletters and label them as 'Newsletter'.",
      type: "GROUP",
      groupId: NEWSLETTER_GROUP_ID,
    },
  },
  {
    title: "Label high priority emails",
    description: `Mark high priority emails as "High Priority". Examples include:
* Customer wants to cancel their plan
* Customer wants to purchase
* Customer complaint`,
    icon: <ShieldAlertIcon className="h-4 w-4" />,
    rule: {
      name: "Label high priority emails",
      actions: [{ type: "LABEL", label: "High Priority" }],
      instructions: "Label high priority emails as 'High Priority'.",
      type: "AI",
    },
  },
  {
    title: "Respond to question",
    description: `If someone asks how much the premium plan is, respond: "Our premium plan is $10 per month."`,
    icon: <MailQuestionIcon className="h-4 w-4" />,
    rule: {
      name: "Respond to question",
      actions: [
        { type: "REPLY", content: "Hey, our premium plan is $10 per month!" },
      ],
      instructions:
        "If someone asks how much the premium plan is, respond: 'Our premium plan is $10 per month.'",
      type: "AI",
    },
  },
];
