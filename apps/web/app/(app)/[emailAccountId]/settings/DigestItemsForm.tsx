import { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { useRules } from "@/hooks/useRules";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { updateDigestItemsAction } from "@/utils/actions/settings";
import {
  updateDigestItemsBody,
  type UpdateDigestItemsBody,
} from "@/utils/actions/settings.validation";
import { ActionType } from "@prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetDigestSettingsResponse } from "@/app/api/user/digest-settings/route";
import { Skeleton } from "@/components/ui/skeleton";

export function DigestItemsForm({
  showSaveButton,
}: {
  showSaveButton: boolean;
}) {
  const { emailAccountId } = useAccount();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();
  const {
    data: digestSettings,
    isLoading: digestLoading,
    error: digestError,
    mutate: mutateDigestSettings,
  } = useSWR<GetDigestSettingsResponse>("/api/user/digest-settings");

  const isLoading = rulesLoading || digestLoading;
  const error = rulesError || digestError;

  // Use local state for MultiSelectFilter
  const [selectedDigestItems, setSelectedDigestItems] = useState<Set<string>>(
    new Set(),
  );

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<UpdateDigestItemsBody>({
    resolver: zodResolver(updateDigestItemsBody),
  });

  // Initialize selected items from rules and digest settings data
  useEffect(() => {
    if (rules && digestSettings) {
      const selectedItems = new Set<string>();

      // Add rules that have digest actions
      rules.forEach((rule) => {
        if (rule.actions.some((action) => action.type === ActionType.DIGEST)) {
          selectedItems.add(rule.id);
        }
      });

      // Add cold email if enabled
      if (digestSettings.coldEmail) {
        selectedItems.add("cold-emails");
      }

      setSelectedDigestItems(selectedItems);
    }
  }, [rules, digestSettings]);

  const onSubmit: SubmitHandler<UpdateDigestItemsBody> =
    useCallback(async () => {
      // Convert selected items back to the expected format
      const ruleDigestPreferences: Record<string, boolean> = {};
      const coldEmailDigest = selectedDigestItems.has("cold-emails");

      // Set all rules to false first
      rules?.forEach((rule) => {
        ruleDigestPreferences[rule.id] = false;
      });

      // Then set selected rules to true
      selectedDigestItems.forEach((itemId) => {
        if (itemId !== "cold-emails") {
          ruleDigestPreferences[itemId] = true;
        }
      });

      const data: UpdateDigestItemsBody = {
        ruleDigestPreferences,
        coldEmailDigest,
      };

      const result = await updateDigestItemsAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error updating digest items",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Your digest items have been updated!" });
        mutateRules();
        mutateDigestSettings();
      }
    }, [
      selectedDigestItems,
      rules,
      mutateRules,
      mutateDigestSettings,
      emailAccountId,
    ]);

  // Create options for MultiSelectFilter
  const digestOptions = [
    ...(rules?.map((rule) => ({
      label: rule.name,
      value: rule.id,
    })) || []),
    {
      label: "Cold Emails",
      value: "cold-emails",
    },
  ];

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="min-h-[500px] w-full" />}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Label>What to include in the digest email</Label>

        <div className="mt-4">
          <MultiSelectFilter
            title="Digest Items"
            options={digestOptions}
            selectedValues={selectedDigestItems}
            setSelectedValues={setSelectedDigestItems}
            maxDisplayedValues={3}
          />
        </div>

        {showSaveButton && (
          <Button type="submit" loading={isSubmitting} className="mt-4">
            Save
          </Button>
        )}
      </form>
    </LoadingContent>
  );
}
