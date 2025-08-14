import type { IconCircleColor } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { CategoryAction } from "@/utils/actions/rule.validation";
import {
  MailIcon,
  NewspaperIcon,
  MegaphoneIcon,
  CalendarIcon,
  ReceiptIcon,
  BellIcon,
  UsersIcon,
} from "lucide-react";

export const categoryConfig: {
  key: string;
  label: string;
  tooltipText: string;
  Icon: React.ElementType;
  iconColor: IconCircleColor;
  action: CategoryAction;
}[] = [
  {
    key: "toReply" as const,
    label: "To Reply",
    tooltipText:
      "Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses",
    Icon: MailIcon,
    iconColor: "blue",
    action: "label",
  },
  {
    key: "newsletter" as const,
    label: "Newsletter",
    tooltipText: "Newsletters, blogs, and publications",
    Icon: NewspaperIcon,
    iconColor: "purple",
    action: "label",
  },
  {
    key: "marketing" as const,
    label: "Marketing",
    tooltipText: "Promotional emails about sales and offers",
    Icon: MegaphoneIcon,
    iconColor: "green",
    action: "label_archive",
  },
  {
    key: "calendar" as const,
    label: "Calendar",
    tooltipText: "Events, appointments, and reminders",
    Icon: CalendarIcon,
    iconColor: "yellow",
    action: "label",
  },
  {
    key: "receipt" as const,
    label: "Receipt",
    tooltipText: "Invoices, receipts, and payments",
    Icon: ReceiptIcon,
    iconColor: "orange",
    action: "label",
  },
  {
    key: "notification" as const,
    label: "Notification",
    tooltipText: "Alerts, status updates, and system messages",
    Icon: BellIcon,
    iconColor: "red",
    action: "label",
  },
  {
    key: "coldEmail" as const,
    label: "Cold Email",
    tooltipText:
      "Unsolicited sales pitches and cold emails. We'll never block someone that's emailed you before",
    Icon: UsersIcon,
    iconColor: "indigo",
    action: "label_archive",
  },
];

export type CategoryKey = (typeof categoryConfig)[number]["key"];
