import type { IconCircleColor } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { CategoryAction } from "@/utils/actions/rule.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { SystemRule } from "@/utils/rule/consts";
import {
  MailIcon,
  NewspaperIcon,
  MegaphoneIcon,
  CalendarIcon,
  ReceiptIcon,
  BellIcon,
  UsersIcon,
} from "lucide-react";

export const categoryConfig = (
  provider: string,
): {
  key: SystemRule;
  label: string;
  tooltipText: string;
  Icon: React.ElementType;
  iconColor: IconCircleColor;
  action: CategoryAction;
}[] => [
  {
    key: SystemRule.ToReply,
    label: "To Reply",
    tooltipText:
      "Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses",
    Icon: MailIcon,
    iconColor: "blue",
    action: "label",
  },
  {
    key: SystemRule.Newsletter,
    label: "Newsletter",
    tooltipText: "Newsletters, blogs, and publications",
    Icon: NewspaperIcon,
    iconColor: "purple",
    action: "label",
  },
  {
    key: SystemRule.Marketing,
    label: "Marketing",
    tooltipText: "Promotional emails about sales and offers",
    Icon: MegaphoneIcon,
    iconColor: "green",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label_archive",
  },
  {
    key: SystemRule.Calendar,
    label: "Calendar",
    tooltipText: "Events, appointments, and reminders",
    Icon: CalendarIcon,
    iconColor: "yellow",
    action: "label",
  },
  {
    key: SystemRule.Receipt,
    label: "Receipt",
    tooltipText: "Invoices, receipts, and payments",
    Icon: ReceiptIcon,
    iconColor: "orange",
    action: "label",
  },
  {
    key: SystemRule.Notification,
    label: "Notification",
    tooltipText: "Alerts, status updates, and system messages",
    Icon: BellIcon,
    iconColor: "red",
    action: "label",
  },
  {
    key: SystemRule.ColdEmail,
    label: "Cold Email",
    tooltipText:
      "Unsolicited sales pitches and cold emails. We'll never block someone that's emailed you before",
    Icon: UsersIcon,
    iconColor: "indigo",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label_archive",
  },
];
