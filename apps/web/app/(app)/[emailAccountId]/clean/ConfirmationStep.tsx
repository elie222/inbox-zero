"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { toastError } from "@/components/Toast";
import { CleanAction } from "@prisma/client";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { HistoryIcon, SettingsIcon } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";

export function ConfirmationStep({
  showFooter,
  action,
  timeRange,
  instructions,
  skips,
  reuseSettings,
}: {
  showFooter: boolean;
  action: CleanAction;
  timeRange: number;
  instructions?: string;
  skips: {
    reply: boolean;
    starred: boolean;
    calendar: boolean;
    receipt: boolean;
    attachment: boolean;
  };
  reuseSettings: boolean;
}) {
  const router = useRouter();
  const { emailAccountId, provider } = useAccount();
  const { step, onPrevious, onNext } = useStep();
  const isGmail = isGoogleProvider(provider);
  const [isNavigating, setIsNavigating] = useState(false);

  // If this is a standalone page (step 0), navigate to onboarding to start the flow
  const handleNext = () => {
    if (isNavigating) return;
    setIsNavigating(true);

    if (step === 0) {
      router.push(prefixPath(emailAccountId, "/clean/onboarding?step=1"));
    } else {
      onNext();
      setIsNavigating(false);
    }
  };

  // If this is a standalone page (step 0), Back should go to onboarding
  const handleBack = () => {
    if (isNavigating) return;
    setIsNavigating(true);

    if (step === 0) {
      router.push(prefixPath(emailAccountId, "/clean/onboarding"));
    } else {
      onPrevious();
      setIsNavigating(false);
    }
  };

  return (
    <div className="text-center">
      <Image
        src="/images/illustrations/business-success-chart.svg"
        alt="clean up"
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <TypographyH3 className="mt-2">Ready to clean up your inbox</TypographyH3>

      <ul className="mx-auto mt-4 max-w-prose list-disc space-y-2 pl-4 text-left">
        <li>
          We'll show you {PREVIEW_RUN_COUNT} sample emails that match your
          criteria.
        </li>
        <li>
          You can then choose to process just those {PREVIEW_RUN_COUNT} to test,
          or process your entire inbox.
        </li>
        <li>
          {action === CleanAction.ARCHIVE ? (
            <>
              Archived emails will be {isGmail ? "labeled" : "moved to the"}{" "}
              <Badge color="green">Archive{isGmail ? "d" : ""}</Badge>{" "}
              {isGmail ? "in Gmail" : "folder in Outlook"}.
            </>
          ) : (
            <>
              Emails marked as read will be labeled{" "}
              <Badge color="green">Read</Badge>{" "}
              {isGmail ? "in Gmail" : "in Outlook"}.
            </>
          )}
        </li>
        <li>No emails are deleted - everything can be found in search.</li>
        {reuseSettings && (
          <li>
            We'll use your settings from the last time you cleaned your inbox.
            You can adjust these{" "}
            <Link
              className="font-semibold hover:underline"
              href={prefixPath(emailAccountId, "/clean/onboarding")}
            >
              here
            </Link>
            .
          </li>
        )}
      </ul>

      <div className="mt-6 flex justify-center gap-2">
        <Button
          size="lg"
          variant="outline"
          onClick={handleBack}
          loading={isNavigating}
        >
          Back
        </Button>
        <Button size="lg" onClick={handleNext} loading={isNavigating}>
          Next
        </Button>
      </div>

      {showFooter && (
        <div className="mt-6 flex items-center justify-center space-x-6 text-sm text-muted-foreground">
          <FooterLink
            icon={HistoryIcon}
            text="History"
            href={prefixPath(emailAccountId, "/clean/history")}
          />
          <FooterLink
            icon={SettingsIcon}
            text="Edit settings"
            href={prefixPath(emailAccountId, "/clean/onboarding")}
          />
        </div>
      )}
    </div>
  );
}

const FooterLink = ({
  icon: Icon,
  text,
  href,
}: {
  icon: React.ElementType;
  text: string;
  href: string;
}) => (
  <Link
    href={href}
    className="flex items-center transition-colors hover:text-primary"
  >
    <Icon className="mr-1 h-4 w-4" />
    <span>{text}</span>
  </Link>
);
