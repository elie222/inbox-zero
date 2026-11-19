"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { useSentWithSignatureToggle } from "@/hooks/useSentWithSignatureToggle";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

export function SentWithSignatureSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { t } = useLingui();
  const { enabled, isExecuting, toggle } =
    useSentWithSignatureToggle(emailAccountId);

  if (env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE) return null;

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <Trans>Include 'Sent with {BRAND_NAME}'</Trans>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          {enabled === undefined ? (
            <Skeleton className="h-5 w-9 rounded-full" />
          ) : (
            <Switch
              aria-label={t`Toggle 'Sent with ${BRAND_NAME}'`}
              checked={enabled}
              disabled={isExecuting}
              onCheckedChange={toggle}
            />
          )}
        </ItemActions>
      </Item>
    </>
  );
}
