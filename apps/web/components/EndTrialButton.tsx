"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCardIcon } from "lucide-react";
import { toast } from "sonner";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import useSWR, { useSWRConfig } from "swr";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import type { GetTrialPreviewResponse } from "@/app/api/user/trial-preview/route";
import { endStripeTrialAction } from "@/utils/actions/premium";
import { formatDateSimple } from "@/utils/date";
import { formatStripeAmount } from "@/utils/stripe-amount";

export function EndTrialButton({
  variant,
  size,
  className,
  showIcon = true,
}: Pick<ButtonProps, "variant" | "size" | "className"> & {
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [endingTrial, setEndingTrial] = useState(false);
  const { mutate } = useSWRConfig();
  const { t, i18n } = useLingui();

  // Revalidate on focus: a dialog left open in a background tab must not
  // charge an amount that no longer matches what is on screen.
  const {
    data: preview,
    isLoading,
    isValidating,
    error,
  } = useSWR<GetTrialPreviewResponse>(open ? "/api/user/trial-preview" : null);

  const endTrial = async () => {
    setEndingTrial(true);
    const result = await endStripeTrialAction().finally(() => {
      setEndingTrial(false);
    });

    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }

    setOpen(false);

    if (result?.data?.status === "active") {
      toast.success(t`Your paid plan is active.`);
    } else {
      toast.message(t`Your trial has ended.`);
    }

    await Promise.all([
      mutate("/api/user/me"),
      mutate("/api/user/ai-automation-status"),
    ]);
  };

  const amount = preview
    ? formatStripeAmount(preview.amountDue, preview.currency)
    : null;
  const planName = preview?.planName;
  const cadence = preview?.interval
    ? i18n._(billingCadence[preview.interval])
    : null;
  const trialEndDate = preview?.trialEnd
    ? formatDateSimple(new Date(preview.trialEnd))
    : null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={className}
          Icon={showIcon ? CreditCardIcon : undefined}
        >
          <Trans>Start paid plan now</Trans>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>End your free trial and pay now?</Trans>
          </AlertDialogTitle>
          <LoadingContent loading={isLoading} error={error}>
            {preview && (
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    {cadence ? (
                      <Trans>
                        We will charge your card{" "}
                        <span className="font-semibold text-foreground">
                          {amount}
                        </span>{" "}
                        immediately for the {planName} plan, billed {cadence}.
                      </Trans>
                    ) : (
                      <Trans>
                        We will charge your card{" "}
                        <span className="font-semibold text-foreground">
                          {amount}
                        </span>{" "}
                        immediately for the {planName} plan.
                      </Trans>
                    )}
                  </p>
                  {trialEndDate && (
                    <p>
                      <Trans>
                        You do not need to do this to keep using Inbox Zero.
                        Your trial already includes every paid feature and runs
                        free until {trialEndDate}, when the same charge happens
                        automatically.
                      </Trans>
                    </p>
                  )}
                  <p>
                    <Trans>
                      Want a different plan or to pay monthly?{" "}
                      <Link href="/premium" className="underline">
                        Change your plan first
                      </Link>
                      .
                    </Trans>
                  </p>
                </div>
              </AlertDialogDescription>
            )}
          </LoadingContent>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <Trans>Keep my free trial</Trans>
          </AlertDialogCancel>
          <Button
            loading={endingTrial}
            disabled={!preview || isValidating}
            onClick={endTrial}
          >
            {amount ? <Trans>Pay {amount} now</Trans> : <Trans>Pay now</Trans>}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const billingCadence: Record<
  NonNullable<GetTrialPreviewResponse["interval"]>,
  MessageDescriptor
> = {
  day: msg`daily`,
  week: msg`weekly`,
  month: msg`monthly`,
  year: msg`yearly`,
};
