"use client";

import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  BarChartBigIcon,
  SettingsIcon,
  UserIcon,
  ScrollTextIcon,
  UsersIcon,
  ShieldCheckIcon,
  CalendarIcon,
  FileTextIcon,
  BrushIcon,
  ZapIcon,
  InboxIcon,
  MailsIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { Command } from "@/lib/commands/types";
import { useSettingsDialog } from "@/hooks/useSettingsDialog";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import {
  useCleanerEnabled,
  useIntegrationsEnabled,
  useMeetingBriefsEnabled,
} from "@/hooks/useFeatureFlags";
import { isGoogleProvider } from "@/utils/email/provider-types";
import {
  getMailNavPath,
  MAILBOX_ITEMS,
} from "@/app/(app)/[emailAccountId]/mail/MailSidebar";

export function useCommandPaletteCommands({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  const { i18n, t } = useLingui();
  const router = useRouter();
  const { openSettings } = useSettingsDialog();
  const { emailAccountId, provider } = useAccount();
  const { data: rulesData, isLoading: rulesLoading } = useRules(
    undefined,
    enabled,
  );
  const showCleaner = useCleanerEnabled();
  const showMeetingBriefs = useMeetingBriefsEnabled();
  const showIntegrations = useIntegrationsEnabled();

  const commands = useMemo<Command[]>(() => {
    const generalSettingsCommands: Command[] = [
      {
        id: "settings-general",
        label: t`Settings`,
        description: t`General account settings`,
        icon: SettingsIcon,
        section: "settings",
        priority: 1,
        keywords: ["settings", "preferences", "configuration"],
        action: () => {
          openSettings();
        },
      },
      {
        id: "settings-mail-setup",
        label: t`Mail setup`,
        description: t`Layout, tabs and bundles`,
        icon: SlidersHorizontalIcon,
        section: "settings",
        priority: 2,
        keywords: ["mail onboarding", "setup", "layout", "tabs", "split"],
        action: () => router.push(prefixPath(emailAccountId, "/mail?setup=1")),
      },
    ];
    // Kept even while a conversation is selected: jumping to another mailbox
    // is as likely then as from anywhere else.
    const mailboxCommands: Command[] = MAILBOX_ITEMS.map((item, index) => {
      const mailbox = i18n._(item.label);
      return {
        id: `nav-mailbox-${item.type}`,
        label: t`Go to ${mailbox}`,
        icon: item.Icon,
        section: "navigation",
        priority: index + 30,
        keywords: [item.name.toLowerCase(), "mailbox", "folder"],
        action: () =>
          router.push(
            prefixPath(
              emailAccountId,
              getMailNavPath({ kind: "type", type: item.type }),
            ),
          ),
      };
    });
    if (!enabled) return [...mailboxCommands, ...generalSettingsCommands];

    const navigationItems = [
      {
        name: "Mail",
        label: t`Go to Mail`,
        href: prefixPath(emailAccountId, "/mail"),
        icon: InboxIcon,
        keywords: ["mail", "inbox", "email"],
      },
      {
        name: "Assistant",
        label: t`Go to Assistant`,
        href: prefixPath(emailAccountId, "/automation"),
        icon: SparklesIcon,
        keywords: ["ai", "assistant", "rules", "auto"],
      },
      {
        name: "Bulk Unsubscribe",
        label: t`Go to Bulk Unsubscribe`,
        href: prefixPath(emailAccountId, "/bulk-unsubscribe"),
        icon: MailsIcon,
        keywords: ["unsubscribe", "newsletters", "spam"],
      },
      {
        name: "Analytics",
        label: t`Go to Analytics`,
        href: prefixPath(emailAccountId, "/stats"),
        icon: BarChartBigIcon,
        keywords: ["statistics", "charts", "data"],
      },
      {
        name: "Calendars",
        label: t`Go to Calendars`,
        href: prefixPath(emailAccountId, "/calendars"),
        icon: CalendarIcon,
        keywords: ["calendar", "scheduling", "meetings"],
      },
      ...(showIntegrations
        ? [
            {
              name: "Integrations",
              label: t`Go to Integrations`,
              href: prefixPath(emailAccountId, "/integrations"),
              icon: ZapIcon,
              keywords: ["integrations", "apps", "connect"],
            },
          ]
        : []),
      ...(showMeetingBriefs
        ? [
            {
              name: "Meeting Briefs",
              label: t`Go to Meeting Briefs`,
              href: prefixPath(emailAccountId, "/briefs"),
              icon: FileTextIcon,
              keywords: ["briefs", "meeting", "summaries"],
            },
          ]
        : []),
      ...(isGoogleProvider(provider) && showCleaner
        ? [
            {
              name: "Deep Clean",
              label: t`Go to Deep Clean`,
              href: prefixPath(emailAccountId, "/clean"),
              icon: BrushIcon,
              keywords: ["clean", "organize", "tidy"],
            },
          ]
        : []),
      {
        name: "Cold Email Blocker",
        label: t`Go to Cold Email Blocker`,
        href: prefixPath(emailAccountId, "/cold-email-blocker"),
        icon: ShieldCheckIcon,
        keywords: ["block", "cold", "spam", "filter"],
      },
    ];
    const navigationCommands: Command[] = navigationItems.map(
      (item, index) => ({
        id: `nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
        label: item.label,
        icon: item.icon,
        section: "navigation",
        priority: index + 10,
        keywords: [item.name.toLowerCase(), ...item.keywords],
        action: () => router.push(item.href),
      }),
    );

    const settingsCommands: Command[] = [
      {
        id: "settings-assistant",
        label: t`Assistant Settings`,
        description: t`Configure AI assistant behavior`,
        icon: SparklesIcon,
        section: "settings",
        priority: 2,
        keywords: ["ai", "assistant", "automation"],
        action: () =>
          router.push(prefixPath(emailAccountId, "/assistant/settings")),
      },
      {
        id: "settings-usage",
        label: t`Usage`,
        description: t`View usage statistics`,
        icon: BarChartBigIcon,
        section: "settings",
        priority: 3,
        keywords: ["usage", "stats", "limits"],
        action: () => router.push(prefixPath(emailAccountId, "/usage")),
      },
      {
        id: "settings-organization",
        label: t`Organization`,
        description: t`Manage organization settings`,
        icon: UsersIcon,
        section: "settings",
        priority: 4,
        keywords: ["org", "team", "organization"],
        action: () => router.push(prefixPath(emailAccountId, "/organization")),
      },
      {
        id: "manage-accounts",
        label: t`Manage Accounts`,
        description: t`Add or switch email accounts`,
        icon: UserIcon,
        section: "settings",
        priority: 5,
        keywords: ["accounts", "email", "switch"],
        action: () => router.push("/accounts"),
      },
    ];

    const ruleCommands: Command[] = (rulesData ?? []).map((rule, index) => ({
      id: `rule-${rule.id}`,
      label: rule.name,
      description: rule.instructions || t`View rule`,
      icon: ScrollTextIcon,
      section: "rules" as const,
      priority: index + 1,
      keywords: ["rule", rule.name.toLowerCase()],
      action: () =>
        router.push(prefixPath(emailAccountId, `/assistant/rule/${rule.id}`)),
    }));

    return [
      ...navigationCommands,
      ...mailboxCommands,
      ...generalSettingsCommands,
      ...settingsCommands,
      ...ruleCommands,
    ];
  }, [
    emailAccountId,
    enabled,
    provider,
    openSettings,
    router,
    rulesData,
    showCleaner,
    showIntegrations,
    showMeetingBriefs,
    i18n,
    t,
  ]);

  return {
    commands,
    isLoading: enabled && rulesLoading,
  };
}
