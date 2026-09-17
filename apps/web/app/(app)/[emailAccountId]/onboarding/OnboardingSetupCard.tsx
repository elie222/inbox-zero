"use client";

import { useMemo } from "react";
import { CheckIcon, TrendingUpIcon } from "lucide-react";
import { ButtonLoader } from "@/components/Loading";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCircle,
  type IconCircleColor,
} from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { ENTER_ANIMATION } from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboardingChatPane";
import type {
  OnboardingRuleAction,
  OnboardingSetup,
} from "@/app/api/chat/onboarding/validation";
import { categoryConfig } from "@/utils/category-config";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { cn } from "@/utils";

const ACTION_LABELS: Record<OnboardingRuleAction, string> = {
  label: "Label",
  label_archive: "Label + archive",
  move_folder: "Move to folder",
};

export function OnboardingSetupCard({
  setup,
  provider,
  editable,
  onChangeAction,
  onToggleRule,
}: {
  setup: OnboardingSetup;
  provider: string;
  editable: boolean;
  onChangeAction: (name: string, action: OnboardingRuleAction) => void;
  onToggleRule: (name: string) => void;
}) {
  const iconByKey = useMemo(() => {
    const map = new Map<
      string,
      { Icon: React.ElementType; iconColor: IconCircleColor }
    >();
    for (const category of categoryConfig(provider)) {
      map.set(category.key, {
        Icon: category.Icon,
        iconColor: category.iconColor,
      });
    }
    return map;
  }, [provider]);

  const isLive = setup.status === "live";
  const shownRules = isLive
    ? setup.rules.filter((rule) => rule.enabled)
    : setup.rules;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-background shadow-sm",
        ENTER_ANIMATION,
      )}
    >
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="text-base font-semibold tracking-tight">Your setup</div>
        <StatusBadge status={setup.status} />
      </div>

      <div className="py-2">
        {shownRules.map((rule, index) => {
          const icon = rule.key ? iconByKey.get(rule.key) : null;
          return (
            <div
              key={rule.name}
              className={cn(
                "flex items-center gap-3 px-4 py-1.5",
                ENTER_ANIMATION,
                "fill-mode-backwards",
                !rule.enabled && "opacity-50",
              )}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <IconCircle
                size="sm"
                color={icon?.iconColor ?? "green"}
                Icon={icon?.Icon ?? TrendingUpIcon}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {rule.name}
                </span>
                {rule.addedByAssistant && (
                  <Badge variant="info" size="xs" className="shrink-0">
                    Added for you
                  </Badge>
                )}
              </div>
              {isLive ? (
                <CheckIcon className="size-4 shrink-0 text-green-600" />
              ) : (
                <>
                  <Select
                    value={rule.action}
                    onValueChange={(action) =>
                      onChangeAction(rule.name, action as OnboardingRuleAction)
                    }
                    disabled={!editable || !rule.enabled}
                  >
                    <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions(provider, rule.action).map((action) => (
                        <SelectItem
                          key={action}
                          value={action}
                          className="text-xs"
                        >
                          {ACTION_LABELS[action]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => onToggleRule(rule.name)}
                    disabled={!editable}
                    aria-label={`Toggle ${rule.name}`}
                  />
                </>
              )}
            </div>
          );
        })}
        {!isLive && (
          <p className="px-4 pb-1 pt-2 text-xs text-muted-foreground/70">
            Custom labels come later, in Settings
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OnboardingSetup["status"] }) {
  switch (status) {
    case "draft":
      return (
        <Badge variant="muted" size="sm">
          Draft
        </Badge>
      );
    case "enabling":
      return (
        <Badge variant="muted" size="sm">
          <ButtonLoader />
          Turning on
        </Badge>
      );
    case "live":
      return (
        <Badge variant="success" size="sm">
          <span className="size-1.5 rounded-full bg-green-600" />
          Live
        </Badge>
      );
    case "error":
      return (
        <Badge variant="warning" size="sm">
          Finish in app
        </Badge>
      );
  }
}

function actionOptions(
  provider: string,
  current: OnboardingRuleAction,
): OnboardingRuleAction[] {
  const options: OnboardingRuleAction[] = isMicrosoftProvider(provider)
    ? ["move_folder", "label", "label_archive"]
    : ["label", "label_archive"];
  return options.includes(current) ? options : [current, ...options];
}
