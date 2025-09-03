"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import shuffle from "lodash/shuffle";
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
  CategoryAction,
  CategoryConfig,
} from "@/utils/actions/rule.validation";
import { categoryConfig } from "@/utils/category-config";
import { useDelayedActionsEnabled } from "@/hooks/useFeatureFlags";
import { usePersona } from "@/hooks/usePersona";
import { usersRolesInfo } from "@/app/(app)/[emailAccountId]/onboarding/config";
import {
  IconCircle,
  type IconCircleColor,
} from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { cn } from "@/utils";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

// copy paste of old file
export function CategoriesSetup({
  emailAccountId,
  provider,
  onNext,
}: {
  emailAccountId: string;
  provider: string;
  onNext: () => void;
}) {
  const { data, isLoading, error } = usePersona();

  // State for managing suggested and basic categories separately
  const [suggestedCategories, setSuggestedCategories] = React.useState<
    CategoryConfig[]
  >([]);
  const [basicCategories, setBasicCategories] = React.useState<
    CategoryConfig[]
  >(
    categoryConfig(provider).map((c) => ({
      name: c.key,
      description: "",
      action: c.action,
      key: c.key,
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
          action: undefined,
          key: null,
        })),
      );
    }
  }, [suggestedLabels, isLoading]);

  const onSubmit = useCallback(async () => {
    const allCategories = [...suggestedCategories, ...basicCategories];

    // runs in background so we can move on to next step faster
    createRulesOnboardingAction(emailAccountId, allCategories);

    onNext();
  }, [onNext, emailAccountId, suggestedCategories, basicCategories]);

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
    <div>
      <SectionHeader>BASIC LABELS</SectionHeader>

      <div className="grid grid-cols-1 gap-2">
        {basicCategories.map((category, index) => {
          const config = categoryConfig(provider).find(
            (c) => c.key === category.name,
          );
          if (!config) return null;
          return (
            <CategoryCard
              key={config.label}
              index={index}
              label={config.label}
              description={config.tooltipText}
              Icon={config.Icon}
              iconColor={config.iconColor}
              update={updateBasicCategory}
              value={category.action}
              useTooltip
              provider={provider}
            />
          );
        })}
      </div>

      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="w-full h-[500px] mt-6" />}
      >
        {suggestedCategories.length > 0 ? (
          <>
            <SectionHeader className="mt-8">SUGGESTED FOR YOU</SectionHeader>
            <div className="grid grid-cols-1 gap-2">
              {suggestedCategories.map((category, index) => {
                return (
                  <CategoryCard
                    key={category.name}
                    index={index}
                    label={category.name}
                    Icon={icons[index % icons.length]}
                    iconColor="blue"
                    description={category.description}
                    update={updateSuggestedCategory}
                    value={category.action}
                    useTooltip={false}
                    provider={provider}
                  />
                );
              })}
              <CustomCategoryCard />
            </div>
          </>
        ) : (
          <div className="mt-2">
            <CustomCategoryCard />
          </div>
        )}
      </LoadingContent>

      <div className="flex justify-center mt-8">
        <ContinueButton type="submit" onClick={onSubmit} />
      </div>
    </div>
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
  useTooltip,
  provider,
}: {
  index: number;
  label: string;
  Icon: React.ElementType;
  iconColor: IconCircleColor;
  description: string;
  update: (index: number, value: { action?: CategoryAction }) => void;
  value?: CategoryAction | null;
  useTooltip: boolean;
  provider: string;
}) {
  const delayedActionsEnabled = useDelayedActionsEnabled();

  return (
    <Card>
      <CardContent className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
        <div className="flex items-center gap-2">
          <IconCircle size="sm" color={iconColor} Icon={Icon} />
          <div>
            {useTooltip ? (
              <div className="flex flex-1 items-center gap-2">
                {label}
                {description && (
                  <TooltipExplanation
                    text={description}
                    className="text-muted-foreground"
                  />
                )}
              </div>
            ) : (
              <>
                <div className="font-medium">{label}</div>
                <div className="text-sm text-muted-foreground">
                  {description}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="sm:ml-auto flex items-center gap-4">
          <Select
            value={value || undefined}
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
              {isMicrosoftProvider(provider) && (
                <>
                  <SelectItem value="label">Categorise</SelectItem>
                  <SelectItem value="move_folder">Move to folder</SelectItem>
                  {delayedActionsEnabled && (
                    <SelectItem value="move_folder_delayed">
                      Move to folder after a week
                    </SelectItem>
                  )}
                </>
              )}
              {isGoogleProvider(provider) && (
                <>
                  <SelectItem value="label">Label</SelectItem>
                  <SelectItem value="label_archive">
                    Label & skip inbox
                  </SelectItem>
                  {delayedActionsEnabled && (
                    <SelectItem value="label_archive_delayed">
                      Label & archive after a week
                    </SelectItem>
                  )}
                </>
              )}
              <SelectItem value="none">Do nothing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomCategoryCard() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <IconCircle size="sm" color="purple" Icon={PencilLineIcon} />

        <div>
          <div className="flex flex-1 items-center gap-2 font-medium">
            Custom
          </div>
          <div className="ml-auto flex items-center gap-4 text-muted-foreground text-sm">
            You can set your own custom categories later
          </div>{" "}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("text-sm font-medium mb-2", className)}>{children}</div>
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
