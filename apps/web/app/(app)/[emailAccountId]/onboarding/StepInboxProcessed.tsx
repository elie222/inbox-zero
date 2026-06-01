"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { ReplyIcon } from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { Skeleton } from "@/components/ui/skeleton";
import { EmailsSortedIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";
import { usePremium } from "@/hooks/usePremium";
import { Badge, type Color } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { formatShortDate, internalDateToDate } from "@/utils/date";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { getEmailTerminology } from "@/utils/terminology";
import { useAccount } from "@/providers/EmailAccountProvider";
import { captureException } from "@/utils/error";
import type { GetOnboardingProcessedEmailsResponse } from "@/app/api/user/onboarding/processed-emails/route";

// Group SystemTypes by intent so the preview reads as semantically meaningful
// rather than rainbow-noise.
const systemTypeBadgeColor: Record<SystemType, Color> = {
  [SystemType.TO_REPLY]: "green",
  [SystemType.ACTIONED]: "green",
  [SystemType.AWAITING_REPLY]: "blue",
  [SystemType.CALENDAR]: "blue",
  [SystemType.NEWSLETTER]: "purple",
  [SystemType.COLD_EMAIL]: "purple",
  [SystemType.RECEIPT]: "orange",
  [SystemType.NOTIFICATION]: "orange",
  [SystemType.MARKETING]: "yellow",
  [SystemType.FYI]: "yellow",
};

function getSystemTypeBadgeColor(
  systemType: SystemType | null | undefined,
): Color {
  return systemType ? systemTypeBadgeColor[systemType] : "gray";
}

export function StepInboxProcessed({ onNext }: { onNext: () => void }) {
  const { isPremium } = usePremium();
  const { provider } = useAccount();
  const { data, isLoading, error } =
    useSWR<GetOnboardingProcessedEmailsResponse>(
      "/api/user/onboarding/processed-emails",
      {
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        revalidateIfStale: false,
      },
    );

  useEffect(() => {
    if (error) {
      captureException(error, {
        extra: { context: "onboarding/processed-emails" },
      });
    }
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <StepInboxProcessedView
        data={data}
        isLoading={isLoading}
        isPremium={isPremium}
        provider={provider}
        onNext={onNext}
      />
    </div>
  );
}

export function StepInboxProcessedView({
  data,
  isLoading,
  isPremium,
  provider,
  onNext,
}: {
  data: GetOnboardingProcessedEmailsResponse | undefined;
  isLoading: boolean;
  isPremium: boolean;
  provider: string;
  onNext: () => void;
}) {
  const hasEmails = !!data && data.emails.length > 0;
  const { label } = getEmailTerminology(provider);
  const pastVerb = isMicrosoftProvider(provider) ? "categorized" : "labeled";
  const hasDrafts = (data?.draftCount ?? 0) > 0;

  return (
    <div className="w-full max-w-xl">
      <div className="mb-6 text-center">
        <PageHeading className="mb-3">
          {hasDrafts
            ? `${label.pluralCapitalized} and drafts are ready`
            : `${label.pluralCapitalized} are ready`}
        </PageHeading>
        <TypographyP className="text-muted-foreground">
          {hasDrafts
            ? `We ${pastVerb} your last ${ONBOARDING_PROCESS_EMAILS_COUNT} emails and drafted replies. Nothing was archived.`
            : `We ${pastVerb} your last ${ONBOARDING_PROCESS_EMAILS_COUNT} emails. Nothing was archived.`}
        </TypographyP>
      </div>

      {isLoading ? (
        <InboxPreviewSkeleton />
      ) : hasEmails ? (
        <InboxPreview emails={data.emails} />
      ) : (
        <EmptyIllustration />
      )}

      <div className="mt-7 flex flex-col items-center gap-3">
        <ContinueButton onClick={onNext} size="lg" />
        {!isPremium && (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Upgrade on the next step to process new emails automatically
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyIllustration() {
  return (
    <div className="flex h-[200px] items-end justify-center">
      <EmailsSortedIllustration animated={false} />
    </div>
  );
}

function InboxPreview({
  emails,
}: {
  emails: GetOnboardingProcessedEmailsResponse["emails"];
}) {
  return (
    <section
      aria-label="Recently organized emails"
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div
        className="max-h-[300px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 28px), transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0, #000 22px, #000 calc(100% - 28px), transparent 100%)",
        }}
      >
        <ul className="divide-y divide-slate-100 py-3.5">
          {emails.map((email) => (
            <EmailRow key={email.messageId} email={email} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function EmailRow({
  email,
}: {
  email: GetOnboardingProcessedEmailsResponse["emails"][number];
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Badge
        color={getSystemTypeBadgeColor(email.systemType)}
        className="flex-shrink-0 whitespace-nowrap"
      >
        {email.label}
      </Badge>

      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="max-w-[140px] flex-shrink-0 truncate text-sm font-medium text-foreground">
          {email.sender}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {email.subject || "(no subject)"}
        </span>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        {email.hasDraft && (
          <Badge color={getActionColor(ActionType.DRAFT_EMAIL)}>
            <ReplyIcon className="mr-1 size-3" />
            Draft
          </Badge>
        )}
        <span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
          {formatShortDate(internalDateToDate(email.date))}
        </span>
      </div>
    </li>
  );
}

function InboxPreviewSkeleton() {
  return (
    <section
      aria-label="Loading recently organized emails"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <ul className="divide-y divide-slate-100 py-3.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5">
            <Skeleton className="h-5 w-20 flex-shrink-0 rounded-md" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Skeleton className="h-4 w-24 flex-shrink-0" />
              <Skeleton className="h-4 w-full max-w-[220px]" />
            </div>
            <Skeleton className="h-4 w-12 flex-shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}
