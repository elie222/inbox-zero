"use client";

import { cn } from "@/utils";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import {
  ArchiveIcon,
  CheckIcon,
  BotIcon,
  type LucideIcon,
  ChromeIcon,
  CalendarIcon,
  UsersIcon,
  MessageSquareIcon,
  InboxIcon,
  Loader2Icon,
} from "lucide-react";
import {
  MutedText,
  PageHeading,
  SectionDescription,
} from "@/components/Typography";
import { Card } from "@/components/ui/card";
import { prefixPath } from "@/utils/path";
import { useSetupProgress } from "@/hooks/useSetupProgress";
import { LoadingContent } from "@/components/LoadingContent";
import { EXTENSION_URL } from "@/utils/config";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  STEP_KEYS,
  getStepNumber,
} from "@/app/(app)/[emailAccountId]/onboarding/steps";
import { InviteMemberModal } from "@/components/InviteMemberModal";
import { BRAND_NAME } from "@/utils/branding";
import { dismissHintAction } from "@/utils/actions/hints";
import { toastError } from "@/components/Toast";

type DismissibleSetupStep =
  | "aiAssistant"
  | "bulkUnsubscribe"
  | "calendarConnected"
  | "teamInvite"
  | "tabsExtension";

function FeatureCard({
  emailAccountId,
  href,
  icon: Icon,
  title,
  description,
}: {
  emailAccountId: string;
  href: `/${string}`;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link href={prefixPath(emailAccountId, href)} className="block">
      <div className="h-full rounded-lg p-6 shadow transition-shadow hover:bg-muted/50 hover:shadow-md">
        <div
          className={cn(
            "p-px rounded-lg shadow-sm bg-gradient-to-b mb-4 inline-flex",
            "from-new-blue-150 to-new-blue-200",
          )}
        >
          <div
            className={cn(
              "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-b shadow-sm transition-transform",
              "from-new-blue-50 to-new-blue-100",
            )}
          >
            <Icon className={cn("h-4 w-4", "text-new-blue-600")} />
          </div>
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
        <MutedText>{description}</MutedText>
      </div>
    </Link>
  );
}

function getFeatures() {
  const features = [
    {
      href: "/assistant",
      icon: MessageSquareIcon,
      title: "Chat",
      description: "Chat with your inbox to find information and take actions",
    },
    {
      href: "/automation",
      icon: BotIcon,
      title: "Assistant",
      description:
        "Your personal email assistant that organizes, archives, and drafts replies",
    },
    {
      href: "/bulk-unsubscribe",
      icon: ArchiveIcon,
      title: "Bulk Unsubscribe",
      description: "Easily unsubscribe from unwanted newsletters in one click",
    },
    {
      href: "/bulk-archive",
      icon: InboxIcon,
      title: "Bulk Archive",
      description: "Quickly clean up your inbox by archiving old emails",
    },
  ] as const;

  return features;
}

function FeatureGrid({
  emailAccountId,
}: {
  emailAccountId: string;
  provider: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
      {getFeatures().map((feature) => (
        <FeatureCard
          key={feature.href}
          emailAccountId={emailAccountId}
          {...feature}
        />
      ))}
    </div>
  );
}

const StepItem = ({
  href,
  icon,
  title,
  timeEstimate,
  completed,
  actionText,
  linkProps,
  onMarkDone,
  showMarkDone,
  markDoneText = "Mark Done",
  markDoneDisabled,
  markDonePending,
  onActionClick,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  timeEstimate: string;
  completed?: boolean;
  actionText: string;
  linkProps?: { target?: string; rel?: string };
  onMarkDone?: () => void;
  showMarkDone?: boolean;
  markDoneText?: string;
  markDoneDisabled?: boolean;
  markDonePending?: boolean;
  onActionClick?: () => void;
}) => {
  const handleMarkDone = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onMarkDone?.();
  };

  return (
    <div
      className={`border-b border-border last:border-0 ${completed ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-8 p-4">
        <div className="flex max-w-lg items-center">
          <div
            className={cn(
              "p-px rounded-lg shadow-sm bg-gradient-to-b mr-3 flex flex-shrink-0 items-center justify-center",
              "from-new-blue-150 to-new-blue-200",
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-[7px] bg-gradient-to-b shadow-sm",
                "from-new-blue-50 to-new-blue-100",
              )}
            >
              <div className="text-new-blue-600">{icon}</div>
            </div>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground/75">
              {timeEstimate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {completed ? (
            <Link href={href} {...linkProps}>
              <div className="flex size-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                <CheckIcon
                  size={14}
                  className="text-green-600 dark:text-green-400"
                />
              </div>
            </Link>
          ) : (
            <>
              {onActionClick ? (
                <button
                  type="button"
                  onClick={onActionClick}
                  className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-600 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900/75"
                >
                  {actionText}
                </button>
              ) : (
                <Link
                  href={href}
                  {...linkProps}
                  className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-600 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900/75"
                >
                  {actionText}
                </Link>
              )}

              {showMarkDone && (
                <button
                  type="button"
                  onClick={handleMarkDone}
                  disabled={markDoneDisabled}
                  title={markDoneText}
                  className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-green-100 hover:text-green-600 dark:bg-slate-800 dark:text-slate-500 dark:hover:bg-green-900/50 dark:hover:text-green-400"
                >
                  {markDonePending ? (
                    <Loader2Icon size={14} className="animate-spin" />
                  ) : (
                    <CheckIcon size={14} />
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function Checklist({
  emailAccountId,
  provider,
  completedCount,
  totalSteps,
  isBulkUnsubscribeConfigured,
  isAiAssistantConfigured,
  isCalendarConnected,
  isTabsExtensionCompleted,
  teamInvite,
  onSetupProgressChanged,
}: {
  emailAccountId: string;
  provider: string;
  completedCount: number;
  totalSteps: number;
  isBulkUnsubscribeConfigured: boolean;
  isAiAssistantConfigured: boolean;
  isCalendarConnected: boolean;
  isTabsExtensionCompleted: boolean;
  teamInvite: {
    completed: boolean;
    organizationId: string | undefined;
  } | null;
  onSetupProgressChanged: () => void;
}) {
  const { executeAsync: dismissSetupStep, isExecuting: isDismissingStep } =
    useAction(dismissHintAction);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [pendingStep, setPendingStep] = useState<DismissibleSetupStep | null>(
    null,
  );
  const progressPercentage = (completedCount / totalSteps) * 100;

  const handleMarkStepDone = useCallback(
    async (stepKey: DismissibleSetupStep) => {
      if (isDismissingStep) {
        return;
      }

      setPendingStep(stepKey);

      try {
        const result = await dismissSetupStep({
          hintId: `setup:${stepKey}:${emailAccountId}`,
        });

        if (result?.serverError || result?.validationErrors) {
          toastError({ description: "Failed to skip this step" });
          return;
        }

        onSetupProgressChanged();
      } finally {
        setPendingStep(null);
      }
    },
    [
      dismissSetupStep,
      emailAccountId,
      isDismissingStep,
      onSetupProgressChanged,
    ],
  );

  const handleOpenInviteModal = () => {
    setIsInviteModalOpen(true);
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Complete your setup</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">
              {completedCount} of {totalSteps} completed
            </span>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <StepItem
        href={prefixPath(
          emailAccountId,
          `/onboarding?step=${getStepNumber(STEP_KEYS.LABELS)}`,
        )}
        icon={<BotIcon size={18} />}
        title="Set up your Personal Assistant"
        timeEstimate="5 minutes"
        completed={isAiAssistantConfigured}
        actionText="Set up"
        onMarkDone={() => handleMarkStepDone("aiAssistant")}
        showMarkDone
        markDoneDisabled={isDismissingStep}
        markDonePending={pendingStep === "aiAssistant"}
      />

      <StepItem
        href={prefixPath(emailAccountId, "/bulk-unsubscribe")}
        icon={<ArchiveIcon size={18} />}
        title="Unsubscribe from a newsletter you don't read"
        timeEstimate="2 minutes"
        completed={isBulkUnsubscribeConfigured}
        actionText="View"
        onMarkDone={() => handleMarkStepDone("bulkUnsubscribe")}
        showMarkDone
        markDoneDisabled={isDismissingStep}
        markDonePending={pendingStep === "bulkUnsubscribe"}
      />

      <StepItem
        href={prefixPath(emailAccountId, "/calendars")}
        icon={<CalendarIcon size={18} />}
        title="Connect your calendar"
        timeEstimate="2 minutes"
        completed={isCalendarConnected}
        actionText="Connect"
        onMarkDone={() => handleMarkStepDone("calendarConnected")}
        showMarkDone
        markDoneDisabled={isDismissingStep}
        markDonePending={pendingStep === "calendarConnected"}
      />

      {teamInvite && (
        <StepItem
          href={prefixPath(emailAccountId, "/organization")}
          icon={<UsersIcon size={18} />}
          title="Invite team members"
          timeEstimate="2 minutes"
          completed={teamInvite.completed}
          actionText="Invite"
          onMarkDone={() => handleMarkStepDone("teamInvite")}
          markDoneDisabled={isDismissingStep}
          markDonePending={pendingStep === "teamInvite"}
          showMarkDone
          markDoneText="Skip"
          onActionClick={handleOpenInviteModal}
        />
      )}

      {teamInvite && (
        <InviteMemberModal
          organizationId={teamInvite.organizationId}
          open={isInviteModalOpen}
          onOpenChange={setIsInviteModalOpen}
          trigger={null}
        />
      )}

      {isGoogleProvider(provider) && (
        <StepItem
          href={EXTENSION_URL}
          linkProps={{ target: "_blank", rel: "noopener noreferrer" }}
          icon={<ChromeIcon size={18} />}
          title={`Optional: Install the ${BRAND_NAME} Tabs extension`}
          timeEstimate="1 minute"
          completed={isTabsExtensionCompleted}
          actionText="Install"
          onMarkDone={() => handleMarkStepDone("tabsExtension")}
          markDoneDisabled={isDismissingStep}
          markDonePending={pendingStep === "tabsExtension"}
          showMarkDone={true}
        />
      )}
    </Card>
  );
}

export function SetupContent() {
  const { emailAccountId, provider } = useAccount();
  const { data, isLoading, error, mutate } = useSetupProgress();

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <SetupPageContent
          emailAccountId={emailAccountId}
          provider={provider}
          isAiAssistantConfigured={data.steps.aiAssistant}
          isBulkUnsubscribeConfigured={data.steps.bulkUnsubscribe}
          isCalendarConnected={data.steps.calendarConnected}
          isTabsExtensionCompleted={data.tabsExtensionCompleted}
          completedCount={data.completed}
          totalSteps={data.total}
          isSetupComplete={data.isComplete}
          teamInvite={data.teamInvite}
          onSetupProgressChanged={() => {
            mutate();
          }}
        />
      )}
    </LoadingContent>
  );
}

function SetupPageContent({
  emailAccountId,
  provider,
  isBulkUnsubscribeConfigured,
  isAiAssistantConfigured,
  isCalendarConnected,
  isTabsExtensionCompleted,
  completedCount,
  totalSteps,
  isSetupComplete,
  teamInvite,
  onSetupProgressChanged,
}: {
  emailAccountId: string;
  provider: string;
  isBulkUnsubscribeConfigured: boolean;
  isAiAssistantConfigured: boolean;
  isCalendarConnected: boolean;
  isTabsExtensionCompleted: boolean;
  completedCount: number;
  totalSteps: number;
  isSetupComplete: boolean;
  teamInvite: {
    completed: boolean;
    organizationId: string | undefined;
  } | null;
  onSetupProgressChanged: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col p-6">
      <div className="mb-4 sm:mb-8">
        <PageHeading className="text-center">{`Welcome to ${BRAND_NAME}`}</PageHeading>
        <SectionDescription className="mt-2 text-center text-base">
          {isSetupComplete
            ? "What would you like to do?"
            : `Complete these steps to get the most out of ${BRAND_NAME}`}
        </SectionDescription>
      </div>

      {/* <StatsCardGrid /> */}

      {isSetupComplete ? (
        <FeatureGrid emailAccountId={emailAccountId} provider={provider} />
      ) : (
        <Checklist
          emailAccountId={emailAccountId}
          provider={provider}
          isBulkUnsubscribeConfigured={isBulkUnsubscribeConfigured}
          isAiAssistantConfigured={isAiAssistantConfigured}
          isCalendarConnected={isCalendarConnected}
          isTabsExtensionCompleted={isTabsExtensionCompleted}
          completedCount={completedCount}
          totalSteps={totalSteps}
          teamInvite={teamInvite}
          onSetupProgressChanged={onSetupProgressChanged}
        />
      )}
    </div>
  );
}
