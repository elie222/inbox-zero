"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { resetLabelColorsAction } from "@/utils/actions/mail";
import { getActionErrorMessage } from "@/utils/error";

export function ResetLabelColorsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { execute, isExecuting } = useAction(
    resetLabelColorsAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data }) => {
        if (!data?.updated) {
          toast.success("Label colors are already set to the defaults.");
          return;
        }
        toast.success(
          `Reset ${data.updated} label${data.updated === 1 ? "" : "s"} to the default colors.`,
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
