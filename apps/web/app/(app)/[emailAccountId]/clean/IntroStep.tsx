"use client";

import Image from "next/image";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { SectionDescription } from "@/components/Typography";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { CleanAction } from "@/generated/prisma/enums";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

export function IntroStep({
  unhandledCount,
  cleanAction,
}: {
  unhandledCount: number;
  cleanAction: CleanAction;
}) {
  const { t } = useLingui();
  const { onNext } = useStep();
  const analytics = useProductAnalytics("deep_clean");

  return (
    <div>
      <PremiumAlertWithData className="mb-20" activeOnly />
      <div className="text-center">
        <Image
          src="/images/illustrations/home-office.svg"
          alt={t`clean up`}
          width={200}
          height={200}
          className="mx-auto dark:brightness-90 dark:invert"
          unoptimized
        />

        <TypographyH3 className="mt-2">
          <Trans>Let's get your inbox cleaned up in 5 minutes</Trans>
        </TypographyH3>

        {unhandledCount === null ? (
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            <Trans>Checking your inbox...</Trans>
          </SectionDescription>
        ) : (
          <>
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              {cleanAction === CleanAction.ARCHIVE ? (
                <Plural
                  value={unhandledCount}
                  one="You have # unarchived email in your inbox."
                  other="You have # unarchived emails in your inbox."
                />
              ) : (
                <Plural
                  value={unhandledCount}
                  one="You have # unread email in your inbox."
                  other="You have # unread emails in your inbox."
                />
              )}
            </SectionDescription>
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              <Trans>
                Let's clean up your inbox while keeping important emails safe.
              </Trans>
            </SectionDescription>
          </>
        )}

        <div className="mt-6">
          <Button
            onClick={() => {
              analytics.captureAction("deep_clean_started", {
                clean_action: cleanAction,
                unhandled_count: unhandledCount,
              });
              onNext();
            }}
            disabled={unhandledCount === null}
          >
            <Trans>Next</Trans>
          </Button>
        </div>
      </div>
    </div>
  );
}
