import { useCallback, useEffect, useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { ActionType } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
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
  const isLoading = rulesLoading;
  const error = rulesError;

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

  // Initialize selected items from rules data
  useEffect(() => {
    if (rules) {
      const selectedItems = new Set<string>();

      // Add rules that have digest actions
      rules.forEach((rule) => {
        if (rule.actions.some((action) => action.type === ActionType.DIGEST)) {
          selectedItems.add(rule.id);
        }
      });

      setSelectedDigestItems(selectedItems);
    }
  }, [rules]);

  const onSubmit: SubmitHandler<UpdateDigestItemsBody> =
    useCallback(async () => {
      // Convert selected items back to the expected format
      const ruleDigestPreferences: Record<string, boolean> = {};

      // Set all rules to false first
      rules?.forEach((rule) => {
        ruleDigestPreferences[rule.id] = false;
      });

      // Then set selected rules to true
      selectedDigestItems.forEach((itemId) => {
        ruleDigestPreferences[itemId] = true;
      });

      const result = await updateDigestItemsAction(emailAccountId, {
        ruleDigestPreferences,
      });

      if (result?.serverError) {
        toastError({
          title: "Error updating digest items",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Your digest items have been updated!" });
        mutateRules();
      }
    }, [selectedDigestItems, rules, mutateRules, emailAccountId]);

  const digestOptions =
    rules?.map((rule) => ({
      label: rule.name,
      value: rule.id,
    })) || [];

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
