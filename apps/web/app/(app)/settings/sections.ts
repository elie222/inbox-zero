import {
  CreditCardIcon,
  LayoutGridIcon,
  MailIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
  WebhookIcon,
  type LucideIcon,
} from "lucide-react";
import { env } from "@/env";

export type SettingsSectionId =
  | "features"
  | "email-accounts"
  | "billing"
  | "team"
  | "ai-model"
  | "developer"
  | "account";

type SettingsSection = {
  id: SettingsSectionId;
  title: string;
  icon: LucideIcon;
};

// Ordered as they appear on the settings page. The sidebar builds its links
// from this list, so the ids double as the page's anchor targets.
export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "features", title: "Features", icon: LayoutGridIcon },
  { id: "email-accounts", title: "Email Accounts", icon: MailIcon },
  { id: "billing", title: "Billing", icon: CreditCardIcon },
  { id: "team", title: "Team", icon: UsersIcon },
  { id: "ai-model", title: "AI Model", icon: SparklesIcon },
  { id: "developer", title: "Developer", icon: WebhookIcon },
  { id: "account", title: "Account", icon: UserIcon },
];

/**
 * Whether a settings section renders under the current configuration.
 *
 * Both the settings page and the sidebar nav read this. Duplicating the env
 * checks would let the nav link to sections that never render.
 */
export function isSettingsSectionVisible(id: SettingsSectionId): boolean {
  switch (id) {
    case "billing":
      return !env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS;
    case "ai-model":
      return !env.NEXT_PUBLIC_AI_MODEL_SETTINGS_DISABLED;
    case "developer":
      return (
        env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED !== false ||
        Boolean(env.NEXT_PUBLIC_EXTERNAL_API_ENABLED)
      );
    default:
      return true;
  }
}

export function getVisibleSettingsSections() {
  return SETTINGS_SECTIONS.filter((section) =>
    isSettingsSectionVisible(section.id),
  );
}
