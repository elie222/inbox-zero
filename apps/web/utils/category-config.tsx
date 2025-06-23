import {
  Mail,
  Newspaper,
  Megaphone,
  Calendar,
  Receipt,
  Bell,
  Users,
} from "lucide-react";

export const categoryConfig = [
  {
    key: "toReply" as const,
    label: "To Reply",
    tooltipText:
      "Emails you need to reply to and those where you're awaiting a reply. The label will update automatically as the conversation progresses",
    icon: <Mail className="h-5 w-5 text-blue-500" />,
  },
  {
    key: "newsletter" as const,
    label: "Newsletter",
    tooltipText: "Newsletters, blogs, and publications",
    icon: <Newspaper className="h-5 w-5 text-purple-500" />,
  },
  {
    key: "marketing" as const,
    label: "Marketing",
    tooltipText: "Promotional emails about sales and offers",
    icon: <Megaphone className="h-5 w-5 text-green-500" />,
  },
  {
    key: "calendar" as const,
    label: "Calendar",
    tooltipText: "Events, appointments, and reminders",
    icon: <Calendar className="h-5 w-5 text-yellow-500" />,
  },
  {
    key: "receipt" as const,
    label: "Receipt",
    tooltipText: "Invoices, receipts, and payments",
    icon: <Receipt className="h-5 w-5 text-orange-500" />,
  },
  {
    key: "notification" as const,
    label: "Notification",
    tooltipText: "Alerts, status updates, and system messages",
    icon: <Bell className="h-5 w-5 text-red-500" />,
  },
  {
    key: "coldEmail" as const,
    label: "Cold Email",
    tooltipText:
      "Unsolicited sales pitches and cold emails. We'll never block someone that's emailed you before",
    icon: <Users className="h-5 w-5 text-indigo-500" />,
  },
];

export type CategoryKey = (typeof categoryConfig)[number]["key"];
