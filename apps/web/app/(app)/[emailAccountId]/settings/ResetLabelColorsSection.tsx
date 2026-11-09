"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { isLabelsKey } from "@/hooks/useLabels";
import { resetLabelColorsAction } from "@/utils/actions/mail";
import { getActionErrorMessage } from "@/utils/error";
import { pluralize } from "@/utils/string";

export function ResetLabelColorsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { mutate } = useSWRConfig();
  const { execute, isExecuting } = useAction(
    resetLabelColorsAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data }) => {
        mutate(isLabelsKey);
        if (!data) return;
        if (data.failed > 0) {
          toast.error(
            `Reset ${pluralizeLabels(data.updated)}, but ${pluralizeLabels(data.failed)} couldn't be updated. Please try again.`,
          );
          return;
        }
        if (data.updated === 0) {
          toast.success("Label colors are already set to the defaults.");
          return;
        }
        toast.success(
          `Reset ${pluralizeLabels(data.updated)} to the default colors.`,
        );
      },
      onError: ({ error }) => {
        toast.error(getActionErrorMessage(error));
      },
    },
  );

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Reset Label Colors</ItemTitle>
          <ItemDescription>
            Restore the default colors for Inbox Zero labels like To Reply and
            Newsletter
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            loading={isExecuting}
            onClick={() => execute()}
          >
            Reset
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}

function pluralizeLabels(count: number) {
  return `${count} ${pluralize(count, "label")}`;
}
