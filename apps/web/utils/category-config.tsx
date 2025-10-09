import type { IconCircleColor } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { CategoryAction } from "@/utils/actions/rule.validation";
import { getCategoryAction, ruleConfig } from "@/utils/rule/consts";
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
    label: ruleConfig[SystemType.TO_REPLY].label,
    tooltipText: ruleConfig[SystemType.TO_REPLY].tooltipText,
    Icon: MailIcon,
    iconColor: "blue",
    action: getCategoryAction(SystemType.TO_REPLY, provider),
  },
  {
    key: SystemType.NEWSLETTER,
    label: ruleConfig[SystemType.NEWSLETTER].label,
    tooltipText: ruleConfig[SystemType.NEWSLETTER].tooltipText,
    Icon: NewspaperIcon,
    iconColor: "purple",
    action: getCategoryAction(SystemType.NEWSLETTER, provider),
  },
  {
    key: SystemType.MARKETING,
    label: ruleConfig[SystemType.MARKETING].label,
    tooltipText: ruleConfig[SystemType.MARKETING].tooltipText,
    Icon: MegaphoneIcon,
    iconColor: "green",
    action: getCategoryAction(SystemType.MARKETING, provider),
  },
  {
    key: SystemType.CALENDAR,
    label: ruleConfig[SystemType.CALENDAR].label,
    tooltipText: ruleConfig[SystemType.CALENDAR].tooltipText,
    Icon: CalendarIcon,
    iconColor: "yellow",
    action: getCategoryAction(SystemType.CALENDAR, provider),
  },
  {
    key: SystemType.RECEIPT,
    label: ruleConfig[SystemType.RECEIPT].label,
    tooltipText: ruleConfig[SystemType.RECEIPT].tooltipText,
    Icon: ReceiptIcon,
    iconColor: "orange",
    action: getCategoryAction(SystemType.RECEIPT, provider),
  },
  {
    key: SystemType.NOTIFICATION,
    label: ruleConfig[SystemType.NOTIFICATION].label,
    tooltipText: ruleConfig[SystemType.NOTIFICATION].tooltipText,
    Icon: BellIcon,
    iconColor: "red",
    action: getCategoryAction(SystemType.NOTIFICATION, provider),
  },
  {
    key: SystemType.COLD_EMAIL,
    label: ruleConfig[SystemType.COLD_EMAIL].label,
    tooltipText: ruleConfig[SystemType.COLD_EMAIL].tooltipText,
    Icon: UsersIcon,
    iconColor: "indigo",
    action: getCategoryAction(SystemType.COLD_EMAIL, provider),
  },
];
