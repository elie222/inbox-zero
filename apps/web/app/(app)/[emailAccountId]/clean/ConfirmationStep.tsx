"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { cleanInboxAction } from "@/utils/actions/clean";
import { toastError } from "@/components/Toast";
import { CleanAction } from "@prisma/client";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { HistoryIcon, SettingsIcon } from "lucide-react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

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
  const { emailAccountId } = useAccount();

  const handleStartCleaning = async () => {
    const result = await cleanInboxAction(emailAccountId, {
      daysOld: timeRange ?? 7,
      instructions: instructions || "",
      action: action || CleanAction.ARCHIVE,
      maxEmails: PREVIEW_RUN_COUNT,
      skips,
    });

    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }

    router.push(
      prefixPath(
        emailAccountId,
        `/clean/run?jobId=${result?.data?.jobId}&isPreviewBatch=true`,
      ),
    );
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
          We'll process {PREVIEW_RUN_COUNT} emails in an initial clean up.
        </li>
        <li>
          If you're happy with the results, we'll continue to process the rest
          of your inbox.
        </li>
        {/* TODO: we should count only emails we're processing */}
        {/* <li>
          The full process to handle {unhandledCount} emails will take
          approximately {estimatedTime}
        </li> */}
        <li>
          {action === CleanAction.ARCHIVE ? (
            <>
              Archived emails will be labeled{" "}
              <Badge color="green">Archived</Badge> in Gmail.
            </>
          ) : (
            <>
              Emails marked as read will be labeled{" "}
              <Badge color="green">Read</Badge> in Gmail.
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

      <div className="mt-6">
        <Button size="lg" onClick={handleStartCleaning}>
          Start Cleaning
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
