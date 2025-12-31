"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  SparklesIcon,
  MailsIcon,
  BarChartBigIcon,
  SettingsIcon,
  UserIcon,
  ScrollTextIcon,
  UsersIcon,
  ArchiveIcon,
  PenLineIcon,
  BrushIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react";
import type { Command } from "@/lib/commands/types";
import { useRules } from "@/hooks/useRules";
import { useUser } from "@/providers/UserProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  keywords?: string[];
}

function useNavigationItems(): NavigationItem[] {
  const { emailAccountId } = useAccount();

  return useMemo(
    () => [
      {
        name: "Mail",
        href: prefixPath(emailAccountId, "/mail"),
        icon: MailsIcon,
        keywords: ["inbox", "emails", "messages"],
      },
      {
        name: "Automation",
        href: prefixPath(emailAccountId, "/automation"),
        icon: SparklesIcon,
        keywords: ["ai", "assistant", "rules", "auto"],
      },
      {
        name: "Bulk Unsubscribe",
        href: prefixPath(emailAccountId, "/bulk-unsubscribe"),
        icon: ArchiveIcon,
        keywords: ["unsubscribe", "newsletters", "spam"],
      },
      {
        name: "Cold Email Blocker",
        href: prefixPath(emailAccountId, "/cold-email-blocker"),
        icon: ShieldCheckIcon,
        keywords: ["block", "cold", "spam", "filter"],
      },
      {
        name: "Compose",
        href: prefixPath(emailAccountId, "/compose"),
        icon: PenLineIcon,
        keywords: ["write", "new", "draft", "send"],
      },
      {
        name: "Email Cleaner",
        href: prefixPath(emailAccountId, "/clean"),
        icon: BrushIcon,
        keywords: ["clean", "organize", "tidy"],
      },
      {
        name: "Analytics",
        href: prefixPath(emailAccountId, "/stats"),
        icon: BarChartBigIcon,
        keywords: ["statistics", "charts", "data"],
      },
    ],
    [emailAccountId],
  );
}

export function useCommandPaletteCommands() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { data: rulesData, isLoading: rulesLoading } = useRules();
  const { user, isLoading: userLoading } = useUser();
  const navigationItems = useNavigationItems();

  const navigationCommands = useMemo<Command[]>(() => {
    return navigationItems.map((item, index) => ({
      id: `nav-${item.name.toLowerCase().replace(/\s+/g, "-")}`,
      label: `Go to ${item.name}`,
      icon: item.icon,
      section: "navigation" as const,
      priority: index + 10,
      keywords: [item.name.toLowerCase(), ...(item.keywords || [])],
      action: () => router.push(item.href),
    }));
  }, [navigationItems, router]);

  const settingsCommands = useMemo<Command[]>(
    () => [
      {
        id: "settings-general",
        label: "Settings",
        description: "General account settings",
        icon: SettingsIcon,
        section: "settings",
        priority: 1,
        keywords: ["settings", "preferences", "configuration"],
        action: () => router.push(prefixPath(emailAccountId, "/settings")),
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
    ],
    [router, emailAccountId],
  );

  const ruleCommands = useMemo<Command[]>(() => {
    if (!rulesData?.rules) return [];

    return rulesData.rules.map((rule, index) => ({
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
  }, [rulesData?.rules, router, emailAccountId]);

  const accountCommands = useMemo<Command[]>(() => {
    if (!user?.emailAccounts) return [];

    return user.emailAccounts
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
  }, [user?.emailAccounts, router, emailAccountId]);

  const allCommands = useMemo(
    () => [
      ...navigationCommands,
      ...settingsCommands,
      ...ruleCommands,
      ...accountCommands,
    ],
    [navigationCommands, settingsCommands, ruleCommands, accountCommands],
  );

  return {
    commands: allCommands,
    isLoading: rulesLoading || userLoading,
    navigationCommands,
    settingsCommands,
    ruleCommands,
    accountCommands,
  };
}
