"use client";

import { useState } from "react";
import Link from "next/link";
import { CreditCardIcon } from "lucide-react";
import { toast } from "sonner";
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
}: Pick<ButtonProps, "variant" | "size" | "className">) {
  const [open, setOpen] = useState(false);
  const [endingTrial, setEndingTrial] = useState(false);
  const { mutate } = useSWRConfig();

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
      toast.success("Your paid plan is active.");
    } else {
      toast.message("Your trial has ended.");
    }

    await Promise.all([
      mutate("/api/user/me"),
      mutate("/api/user/ai-automation-status"),
    ]);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <CreditCardIcon className="mr-2 h-4 w-4" />
          Start paid plan now
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End your free trial and pay now?</AlertDialogTitle>
          <LoadingContent loading={isLoading} error={error}>
            {preview && (
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    We will charge your card{" "}
                    <span className="font-semibold text-foreground">
                      {formatStripeAmount(preview.amountDue, preview.currency)}
                    </span>{" "}
                    immediately for the {preview.planName} plan
                    {preview.interval
                      ? `, billed ${billingCadence[preview.interval]}`
                      : ""}
                    .
                  </p>
                  {preview.trialEnd && (
                    <p>
                      You do not need to do this to keep using Inbox Zero. Your
                      trial already includes every paid feature and runs free
                      until {formatDateSimple(new Date(preview.trialEnd))}, when
                      the same charge happens automatically.
                    </p>
                  )}
                  <p>
                    Want a different plan or to pay monthly?{" "}
                    <Link href="/premium" className="underline">
                      Change your plan first
                    </Link>
                    .
                  </p>
                </div>
              </AlertDialogDescription>
            )}
          </LoadingContent>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my free trial</AlertDialogCancel>
          <Button
            loading={endingTrial}
            disabled={!preview || isValidating}
            onClick={endTrial}
          >
            {preview
              ? `Pay ${formatStripeAmount(preview.amountDue, preview.currency)} now`
              : "Pay now"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const billingCadence: Record<
  NonNullable<GetTrialPreviewResponse["interval"]>,
  string
> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  year: "yearly",
};
