"use client";

import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon, MailIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { BRAND_NAME } from "@/utils/branding";

export function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-4 py-8 dark:bg-background">
      <div className="flex max-w-md flex-col items-center text-center duration-500 animate-in fade-in">
        <IconCircle size="lg" className="mb-4">
          <MailIcon className="size-6" />
        </IconCircle>
        <PageHeading className="mb-3">
          <Trans>Welcome to {BRAND_NAME}</Trans>
        </PageHeading>
        <TypographyP className="mb-8 text-pretty text-muted-foreground">
          <Trans>
            Your AI email assistant. It sorts your inbox, drafts your replies,
            and clears out the clutter, right inside Gmail or Outlook.
          </Trans>
        </TypographyP>
        <Button className="w-full max-w-xs" onClick={onNext}>
          <Trans>See how it works</Trans>
          <ArrowRightIcon className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
