"use client";

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
  MailsIcon,
} from "lucide-react";
import type { Command } from "@/lib/commands/types";
import { useRules } from "@/hooks/useRules";
import { useUser } from "@/hooks/useUser";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import {
  useCleanerEnabled,
  useIntegrationsEnabled,
  useMeetingBriefsEnabled,
} from "@/hooks/useFeatureFlags";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function useCommandPaletteCommands({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  const router = useRouter();
  const { emailAccountId, provider } = useAccount();
  const { data: rulesData, isLoading: rulesLoading } = useRules(
    undefined,
    enabled,
  );
  const { data: user, isLoading: userLoading } = useUser(enabled);
  const showCleaner = useCleanerEnabled();
  const showMeetingBriefs = useMeetingBriefsEnabled();
  const showIntegrations = useIntegrationsEnabled();

  const commands = useMemo<Command[]>(() => {
    if (!enabled) return [];

    const navigationItems = [
      {
        name: "Assistant",
        href: prefixPath(emailAccountId, "/automation"),
        icon: SparklesIcon,
        keywords: ["ai", "assistant", "rules", "auto"],
      },
      {
        name: "Bulk Unsubscribe",
        href: prefixPath(emailAccountId, "/bulk-unsubscribe"),
        icon: MailsIcon,
        keywords: ["unsubscribe", "newsletters", "spam"],
      },
      {
        name: "Analytics",
        href: prefixPath(emailAccountId, "/stats"),
        icon: BarChartBigIcon,
        keywords: ["statistics", "charts", "data"],
      },
      {
        name: "Calendars",
        href: prefixPath(emailAccountId, "/calendars"),
        icon: CalendarIcon,
        keywords: ["calendar", "scheduling", "meetings"],
      },
      ...(showIntegrations
        ? [
            {
              name: "Integrations",
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
              href: prefixPath(emailAccountId, "/clean"),
              icon: BrushIcon,
              keywords: ["clean", "organize", "tidy"],
            },
          ]
        : []),
      {
        name: "Cold Email Blocker",
        href: prefixPath(emailAccountId, "/cold-email-blocker"),
        icon: ShieldCheckIcon,
        keywords: ["block", "cold", "spam", "filter"],
      },
    ];
    const navigationCommands: Command[] = navigationItems.map(
      (item, index) => ({
        id: `nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
        label: `Go to ${item.name}`,
        icon: item.icon,
        section: "navigation",
        priority: index + 10,
        keywords: [item.name.toLowerCase(), ...item.keywords],
        action: () => router.push(item.href),
      }),
    );

    const settingsCommands: Command[] = [
      {
        id: "settings-general",
        label: "Settings",
        description: "General account settings",
        icon: SettingsIcon,
        section: "settings",
        priority: 1,
        keywords: ["settings", "preferences", "configuration"],
        action: () => router.push("/settings"),
      },
      {
        id: "settings-assistant",
        label: "Assistant Settings",
        description: "Configure AI assistant behavior",
        icon: SparklesIcon,
        section: "settings",
        priority: 2,
        keywords: ["ai", "assistant", "automation"],
        action: () =>
          router.push(prefixPath(emailAccountId, "/assistant/settings")),
      },
      {
        id: "settings-usage",
        label: "Usage",
        description: "View usage statistics",
        icon: BarChartBigIcon,
        section: "settings",
        priority: 3,
        keywords: ["usage", "stats", "limits"],
        action: () => router.push(prefixPath(emailAccountId, "/usage")),
      },
      {
        id: "settings-organization",
        label: "Organization",
        description: "Manage organization settings",
        icon: UsersIcon,
        section: "settings",
        priority: 4,
        keywords: ["org", "team", "organization"],
        action: () => router.push(prefixPath(emailAccountId, "/organization")),
      },
      {
        id: "manage-accounts",
        label: "Manage Accounts",
        description: "Add or switch email accounts",
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
      description: rule.instructions || "View rule",
      icon: ScrollTextIcon,
      section: "rules" as const,
      priority: index + 1,
      keywords: ["rule", rule.name.toLowerCase()],
      action: () =>
        router.push(prefixPath(emailAccountId, `/assistant/rule/${rule.id}`)),
    }));

    const accountCommands: Command[] = (user?.emailAccounts ?? [])
      .filter((account) => account.id !== emailAccountId)
      .map((account, index) => ({
        id: `account-${account.id}`,
        label: `Switch to ${account.email}`,
        description: account.name || undefined,
        icon: UserIcon,
        section: "accounts" as const,
        priority: index + 1,
        keywords: ["switch", "account", account.email?.toLowerCase() || ""],
        action: () => router.push(prefixPath(account.id, "/automation")),
      }));

    return [
      ...navigationCommands,
      ...settingsCommands,
      ...ruleCommands,
      ...accountCommands,
    ];
  }, [
    emailAccountId,
    enabled,
    provider,
    router,
    rulesData,
    showCleaner,
    showIntegrations,
    showMeetingBriefs,
    user?.emailAccounts,
  ]);

  return {
    commands,
    isLoading: enabled && (rulesLoading || userLoading),
  };
}
