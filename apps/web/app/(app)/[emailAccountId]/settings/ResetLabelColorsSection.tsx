"use client";

import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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

export function ResetLabelColorsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { t } = useLingui();
  const { mutate } = useSWRConfig();
  const { execute, isExecuting } = useAction(
    resetLabelColorsAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data }) => {
        mutate(isLabelsKey);
        if (!data) return;
        if (data.failed > 0) {
          toast.error(
            t`Reset ${plural(data.updated, {
              one: "# label",
              other: "# labels",
            })}, but ${plural(data.failed, {
              one: "# label",
              other: "# labels",
            })} couldn't be updated. Please try again.`,
          );
          return;
        }
        if (data.updated === 0) {
          toast.success(t`Label colors are already set to the defaults.`);
          return;
        }
        toast.success(
          t`${plural(data.updated, {
            one: "Reset # label to the default colors.",
            other: "Reset # labels to the default colors.",
          })}`,
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
          <ItemTitle>
            <Trans>Reset Label Colors</Trans>
          </ItemTitle>
          <ItemDescription>
            <Trans>
              Restore the default colors for Inbox Zero labels like To Reply and
              Newsletter
            </Trans>
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            loading={isExecuting}
            onClick={() => execute()}
          >
            <Trans>Reset</Trans>
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}
