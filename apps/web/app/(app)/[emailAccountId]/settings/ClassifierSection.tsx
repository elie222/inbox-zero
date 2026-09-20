"use client";

import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { toastError, toastSuccess } from "@/components/Toast";
import { useUser } from "@/hooks/useUser";
import { updateClassifierSettingsAction } from "@/utils/actions/settings";
import { getActionErrorMessage } from "@/utils/error";

export function ClassifierSection() {
  const { data, mutate } = useUser();

  const { execute, isExecuting } = useAction(updateClassifierSettingsAction, {
    onSuccess: () => {
      toastSuccess({ description: "Settings updated!" });
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Failed to update settings",
        }),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  if (!data) return null;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Specialized decision model</ItemTitle>
        <ItemDescription>
          Use an optional classification model for rule matching and other
          structured decisions. Falls back to your AI model if unavailable.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          checked={data.classifierEnabled}
          onCheckedChange={(classifierEnabled) => {
            mutate({ ...data, classifierEnabled }, false);
            execute({ classifierEnabled });
          }}
          disabled={isExecuting}
        />
      </ItemActions>
    </Item>
  );
}
