"use client";

import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Card } from "@/components/ui/card";
import {
  PageSubHeading,
  TypographyH3,
  TypographyH4,
} from "@/components/Typography";
import { ConnectDrive } from "./ConnectDrive";

const steps = [
  {
    number: 1,
    title: msg`Tell us how you organize`,
    description: msg`"Receipts go to Expenses by month. Contracts go to Legal."`,
  },
  {
    number: 2,
    title: msg`Attachments get filed`,
    description: msg`AI reads each document and files it to the right folder`,
  },
  {
    number: 3,
    title: msg`You stay in control`,
    description: msg`Get an email when files are sorted—reply to correct`,
  },
];

export function DriveOnboarding() {
  const { i18n } = useLingui();

  return (
    <div className="mx-auto max-w-xl py-8">
      <TypographyH3 className="text-center">
        <Trans>Attachments filed automatically while you work</Trans>
      </TypographyH3>

      <div className="mt-10 space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
              {step.number}
            </div>
            <div>
              <TypographyH4>{i18n._(step.title)}</TypographyH4>
              <PageSubHeading className="mt-1">
                {i18n._(step.description)}
              </PageSubHeading>
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-10 p-6">
        <TypographyH4 className="text-center">
          <Trans>Where should we file your attachments?</Trans>
        </TypographyH4>
        <div className="mt-4 flex justify-center">
          <ConnectDrive />
        </div>
      </Card>
    </div>
  );
}
