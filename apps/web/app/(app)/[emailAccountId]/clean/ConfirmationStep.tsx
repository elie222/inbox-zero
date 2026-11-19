"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { MutedText, TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { cleanInboxAction } from "@/utils/actions/clean";
import { toastError } from "@/components/Toast";
import { CleanAction } from "@/generated/prisma/enums";
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
  const { t } = useLingui();
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
        alt={t`clean up`}
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <TypographyH3 className="mt-2">
        <Trans>Ready to clean up your inbox</Trans>
      </TypographyH3>

      <ul className="mx-auto mt-4 max-w-prose list-disc space-y-2 pl-4 text-left">
        <li>
          <Plural
            value={PREVIEW_RUN_COUNT}
            one="We'll process # email in an initial clean up."
            other="We'll process # emails in an initial clean up."
          />
        </li>
        <li>
          <Trans>
            If you're happy with the results, we'll continue to process the rest
            of your inbox.
          </Trans>
        </li>
        {/* TODO: we should count only emails we're processing */}
        {/* <li>
          The full process to handle {unhandledCount} emails will take
          approximately {estimatedTime}
        </li> */}
        <li>
          {action === CleanAction.ARCHIVE ? (
            <Trans>
              Archived emails will be labeled{" "}
              <Badge color="green">{ARCHIVED_LABEL}</Badge> in Gmail.
            </Trans>
          ) : (
            <Trans>
              Emails marked as read will be labeled{" "}
              <Badge color="green">{READ_LABEL}</Badge> in Gmail.
            </Trans>
          )}
        </li>
        <li>
          <Trans>
            No emails are deleted - everything can be found in search.
          </Trans>
        </li>
        {reuseSettings && (
          <li>
            <Trans>
              We'll use your settings from the last time you cleaned your inbox.
              You can adjust these{" "}
              <Link
                className="font-semibold hover:underline"
                href={prefixPath(emailAccountId, "/clean/onboarding")}
              >
                here
              </Link>
              .
            </Trans>
          </li>
        )}
      </ul>

      <div className="mt-6">
        <Button size="lg" onClick={handleStartCleaning}>
          <Trans>Start Cleaning</Trans>
        </Button>
      </div>

      {showFooter && (
        <MutedText className="mt-6 flex items-center justify-center space-x-6">
          <FooterLink
            icon={HistoryIcon}
            text={t`History`}
            href={prefixPath(emailAccountId, "/clean/history")}
          />
          <FooterLink
            icon={SettingsIcon}
            text={t`Edit settings`}
            href={prefixPath(emailAccountId, "/clean/onboarding")}
          />
        </MutedText>
      )}
    </div>
  );
}

// Real Gmail label names, so not translated
const ARCHIVED_LABEL = "Archived";
const READ_LABEL = "Read";

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
