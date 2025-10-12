import type { IconCircleColor } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { CategoryAction } from "@/utils/actions/rule.validation";
import {
  getCategoryAction,
  getRuleConfig,
  getRuleLabel,
} from "@/utils/rule/consts";
import { SystemType } from "@prisma/client";
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
  key: SystemType;
  label: string;
  tooltipText: string;
  Icon: React.ElementType;
  iconColor: IconCircleColor;
  action: CategoryAction;
}[] => [
  {
    key: SystemType.TO_REPLY,
    label: getRuleLabel(SystemType.TO_REPLY),
    tooltipText: getRuleConfig(SystemType.TO_REPLY).tooltipText,
    Icon: MailIcon,
    iconColor: "blue",
    action: getCategoryAction(SystemType.TO_REPLY, provider),
  },
  {
    key: SystemType.NEWSLETTER,
    label: getRuleLabel(SystemType.NEWSLETTER),
    tooltipText: getRuleConfig(SystemType.NEWSLETTER).tooltipText,
    Icon: NewspaperIcon,
    iconColor: "purple",
    action: getCategoryAction(SystemType.NEWSLETTER, provider),
  },
  {
    key: SystemType.MARKETING,
    label: getRuleLabel(SystemType.MARKETING),
    tooltipText: getRuleConfig(SystemType.MARKETING).tooltipText,
    Icon: MegaphoneIcon,
    iconColor: "green",
    action: getCategoryAction(SystemType.MARKETING, provider),
  },
  {
    key: SystemType.CALENDAR,
    label: getRuleLabel(SystemType.CALENDAR),
    tooltipText: getRuleConfig(SystemType.CALENDAR).tooltipText,
    Icon: CalendarIcon,
    iconColor: "yellow",
    action: getCategoryAction(SystemType.CALENDAR, provider),
  },
  {
    key: SystemType.RECEIPT,
    label: getRuleLabel(SystemType.RECEIPT),
    tooltipText: getRuleConfig(SystemType.RECEIPT).tooltipText,
    Icon: ReceiptIcon,
    iconColor: "orange",
    action: getCategoryAction(SystemType.RECEIPT, provider),
  },
  {
    key: SystemType.NOTIFICATION,
    label: getRuleLabel(SystemType.NOTIFICATION),
    tooltipText: getRuleConfig(SystemType.NOTIFICATION).tooltipText,
    Icon: BellIcon,
    iconColor: "red",
    action: getCategoryAction(SystemType.NOTIFICATION, provider),
  },
  {
    key: SystemType.COLD_EMAIL,
    label: getRuleLabel(SystemType.COLD_EMAIL),
    tooltipText: getRuleConfig(SystemType.COLD_EMAIL).tooltipText,
    Icon: UsersIcon,
    iconColor: "indigo",
    action: getCategoryAction(SystemType.COLD_EMAIL, provider),
  },
];
