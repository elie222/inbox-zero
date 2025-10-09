import type { IconCircleColor } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import type { CategoryAction } from "@/utils/actions/rule.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { ruleConfig } from "@/utils/rule/consts";
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
    action: ruleConfig[SystemType.TO_REPLY].categoryAction,
  },
  {
    key: SystemType.NEWSLETTER,
    label: ruleConfig[SystemType.NEWSLETTER].label,
    tooltipText: ruleConfig[SystemType.NEWSLETTER].tooltipText,
    Icon: NewspaperIcon,
    iconColor: "purple",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label",
  },
  {
    key: SystemType.MARKETING,
    label: ruleConfig[SystemType.MARKETING].label,
    tooltipText: ruleConfig[SystemType.MARKETING].tooltipText,
    Icon: MegaphoneIcon,
    iconColor: "green",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label_archive",
  },
  {
    key: SystemType.CALENDAR,
    label: ruleConfig[SystemType.CALENDAR].label,
    tooltipText: ruleConfig[SystemType.CALENDAR].tooltipText,
    Icon: CalendarIcon,
    iconColor: "yellow",
    action: "label",
  },
  {
    key: SystemType.RECEIPT,
    label: ruleConfig[SystemType.RECEIPT].label,
    tooltipText: ruleConfig[SystemType.RECEIPT].tooltipText,
    Icon: ReceiptIcon,
    iconColor: "orange",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label",
  },
  {
    key: SystemType.NOTIFICATION,
    label: ruleConfig[SystemType.NOTIFICATION].label,
    tooltipText: ruleConfig[SystemType.NOTIFICATION].tooltipText,
    Icon: BellIcon,
    iconColor: "red",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label",
  },
  {
    key: SystemType.COLD_EMAIL,
    label: ruleConfig[SystemType.COLD_EMAIL].label,
    tooltipText: ruleConfig[SystemType.COLD_EMAIL].tooltipText,
    Icon: UsersIcon,
    iconColor: "indigo",
    action: isMicrosoftProvider(provider) ? "move_folder" : "label_archive",
  },
];
