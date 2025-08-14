"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import shuffle from "lodash/shuffle";
import { useRouter } from "next/navigation";
import {
  AirplayIcon,
  AtomIcon,
  AudioWaveformIcon,
  AwardIcon,
  AxeIcon,
  BlendIcon,
  InboxIcon,
  MailIcon,
  PencilLineIcon,
  PenIcon,
  UserIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRulesOnboardingAction } from "@/utils/actions/rule";
import type {
  CreateRulesOnboardingBody,
  CategoryAction,
} from "@/utils/actions/rule.validation";
import { prefixPath } from "@/utils/path";
import { categoryConfig } from "@/utils/category-config";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useDelayedActionsEnabled } from "@/hooks/useFeatureFlags";
import { usePersona } from "@/hooks/usePersona";
import { usersRolesInfo } from "@/app/(app)/[emailAccountId]/onboarding/config";
import {
  IconCircle,
  type IconCircleColor,
} from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";

// copy paste of old file
export function CategoriesSetup() {
  const router = useRouter();
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = usePersona();

  // State for managing suggested and basic categories separately
  const [suggestedCategories, setSuggestedCategories] = React.useState<
    Array<{ name: string; description?: string; action?: CategoryAction }>
  >([]);
  const [basicCategories, setBasicCategories] = React.useState<
    Array<{ name: string; description?: string; action?: CategoryAction }>
  >(
    categoryConfig.map((c) => ({
      name: c.key,
      action: "label",
    })),
  );

  const suggestedLabels = usersRolesInfo[data?.role || ""]?.suggestedLabels;

  // Initialize categories when persona data loads
  useEffect(() => {
    if (!isLoading && suggestedLabels) {
      setSuggestedCategories(
        suggestedLabels.map((s) => ({
          name: s.label,
          description: s.description,
          action: "label",
        })),
      );
    }
  }, [suggestedLabels, isLoading]);

  const onSubmit = useCallback(async () => {
    // Combine and filter categories
    const allCategories = [...suggestedCategories, ...basicCategories];

    // runs in background so we can move on to next step faster
    createRulesOnboardingAction(emailAccountId, allCategories);

    router.push(prefixPath(emailAccountId, "/onboarding?step=4"));
  }, [emailAccountId, router, suggestedCategories, basicCategories]);

  const updateSuggestedCategory = useCallback(
    (index: number, value: { action?: CategoryAction }) => {
      setSuggestedCategories((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], ...value };
        return updated;
      });
    },
    [],
  );

  const updateBasicCategory = useCallback(
    (index: number, value: { action?: CategoryAction }) => {
      setBasicCategories((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], ...value };
        return updated;
      });
    },
    [],
  );

  const icons = useMemo(() => getRandomIcons(), []);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="w-full h-[1000px]" />}
    >
      <div>
        {suggestedCategories.length > 0 && (
          <>
            <div className="text-sm font-medium mb-2">SUGGESTED FOR YOU</div>
            <div className="grid grid-cols-1 gap-2">
              {suggestedCategories.map((category, index) => {
                return (
                  <CategoryCard
                    key={`suggested-${index}`}
                    index={index}
                    label={category.name}
                    Icon={icons[index % icons.length]}
                    iconColor="blue"
                    description={category.description}
                    update={updateSuggestedCategory}
                    value={category.action}
                  />
                );
              })}
            </div>
          </>
        )}

        <div className="text-sm font-medium mt-8 mb-2">BASIC LABELS</div>

        <div className="grid grid-cols-1 gap-2">
          {basicCategories.map((category, index) => {
            const config = categoryConfig.find((c) => c.key === category.name);
            if (!config) return null;
            return (
              <CategoryCard
                key={`basic-${index}`}
                index={index}
                label={config.label}
                description={config.tooltipText}
                Icon={config.Icon}
                iconColor={config.iconColor}
                update={updateBasicCategory}
                value={category.action}
              />
            );
          })}

          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <IconCircle size="sm" color="purple">
                <PencilLineIcon className="size-4 text-purple-500" />
              </IconCircle>

              <div className="flex flex-1 items-center gap-2 font-medium">
                Custom
              </div>
              <div className="ml-auto flex items-center gap-4 text-muted-foreground text-sm">
                You can set your own custom categories later
              </div>
            </CardContent>
          </Card>
        </div>

        <button
          onClick={onSubmit}
          className="hidden"
          id="submit-categories"
          type="button"
        />
      </div>
    </LoadingContent>
  );
}

function CategoryCard({
  index,
  label,
  Icon,
  iconColor,
  description,
  update,
  value,
}: {
  index: number;
  label: string;
  Icon: React.ElementType;
  iconColor: IconCircleColor;
  description?: string;
  update: (index: number, value: { action?: CategoryAction }) => void;
  value?: CategoryAction;
}) {
  const delayedActionsEnabled = useDelayedActionsEnabled();

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <IconCircle size="sm" color={iconColor} Icon={Icon} />
        <div>
          <div className="font-medium">{label}</div>
          <div className="text-sm text-muted-foreground">{description}</div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <Select
            value={value}
            onValueChange={(value) => {
              update(index, {
                action:
                  value === "none" ? undefined : (value as CategoryAction),
              });
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="label">Label</SelectItem>
              <SelectItem value="label_archive">Label + skip inbox</SelectItem>
              {delayedActionsEnabled && (
                <SelectItem value="label_archive_delayed">
                  Label + archive after a week
                </SelectItem>
              )}
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function getRandomIcons() {
  const icons = [
    MailIcon,
    InboxIcon,
    PenIcon,
    UserIcon,
    AirplayIcon,
    AxeIcon,
    AtomIcon,
    AwardIcon,
    AudioWaveformIcon,
    BlendIcon,
  ];

  return shuffle(icons);
}
