"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { resetAnalyticsAction } from "@/utils/actions/user";

export function ResetAnalyticsSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { t } = useLingui();
  const { executeAsync: executeResetAnalytics } = useAction(
    resetAnalyticsAction.bind(null, emailAccountId),
  );

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <Trans>Reset Analytics</Trans>
          </ItemTitle>
          <ItemDescription>
            <Trans>Permanently delete all analytics</Trans>
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              toast.promise(() => executeResetAnalytics(), {
                loading: t`Resetting analytics...`,
                success: () =>
                  t`Analytics reset! Visit the Unsubscriber or Analytics page and click the 'Load More' button to reload your data.`,
                error: (err: unknown) => {
                  const message =
                    err instanceof Error ? err.message : t`Unknown error`;
                  return t`Error resetting analytics: ${message}`;
                },
              });
            }}
          >
            <Trans>Reset</Trans>
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}
