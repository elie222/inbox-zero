import Link from "next/link";
import { cookies } from "next/headers";
import {
  ArchiveIcon,
  CheckIcon,
  MailIcon,
  BanIcon,
  BotIcon,
  type LucideIcon,
} from "lucide-react";
import prisma from "@/utils/prisma";
import { PageHeading, SectionDescription } from "@/components/Typography";
import { LoadStats } from "@/providers/StatLoaderProvider";
import { Card } from "@/components/ui/card";
import { REPLY_ZERO_ONBOARDING_COOKIE } from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";

export default async function SetupPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      coldEmailBlocker: true,
      rules: { select: { id: true }, take: 1 },
      newsletters: {
        where: { status: { not: null } },
        take: 1,
      },
    },
  });

  if (!emailAccount) throw new Error("User not found");

  const isAiAssistantConfigured = emailAccount.rules.length > 0;
  const isBulkUnsubscribeConfigured = emailAccount.newsletters.length > 0;
  const cookieStore = await cookies();
  const isReplyTrackerConfigured =
    cookieStore.get(REPLY_ZERO_ONBOARDING_COOKIE)?.value === "true";

  return (
    <>
      <SetupContent
        emailAccountId={emailAccountId}
        isReplyTrackerConfigured={isReplyTrackerConfigured}
        isAiAssistantConfigured={isAiAssistantConfigured}
        isBulkUnsubscribeConfigured={isBulkUnsubscribeConfigured}
      />
      <LoadStats loadBefore showToast={false} />
    </>
  );
}

function FeatureCard({
  emailAccountId,
  href,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
}: {
  emailAccountId: string;
  href: `/${string}`;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={prefixPath(emailAccountId, href)} className="block">
      <div className="h-full rounded-lg p-6 shadow transition-shadow hover:bg-muted/50 hover:shadow-md">
        <div
          className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}
        >
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <h3 className="mb-2 text-lg font-medium text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

const features = [
  {
    href: "/reply-zero",
    icon: MailIcon,
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    iconColor: "text-blue-600 dark:text-blue-400",
    title: "Reply Zero",
    description:
      "Track emails needing replies & follow-ups. Get AI-drafted responses",
  },
  {
    href: "/bulk-unsubscribe",
    icon: ArchiveIcon,
    iconBg: "bg-purple-100 dark:bg-purple-900/50",
    iconColor: "text-purple-600 dark:text-purple-400",
    title: "Bulk Unsubscribe",
    description: "Easily unsubscribe from unwanted newsletters in one click",
  },
  {
    href: "/automation",
    icon: BotIcon,
    iconBg: "bg-green-100 dark:bg-green-900/50",
    iconColor: "text-green-600 dark:text-green-400",
    title: "AI Assistant",
    description:
      "Your personal email assistant that organizes, archives, and drafts replies",
  },
  {
    href: "/cold-email-blocker",
    icon: BanIcon,
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
    iconColor: "text-orange-600 dark:text-orange-400",
    title: "Cold Email Blocker",
    description: "Filter out unsolicited messages and keep your inbox clean",
  },
] as const;

function FeatureGrid({ emailAccountId }: { emailAccountId: string }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
      {features.map((feature) => (
        <FeatureCard
          key={feature.href}
          emailAccountId={emailAccountId}
          {...feature}
        />
      ))}
    </div>
  );
}

function SetupContent({
  emailAccountId,
  isReplyTrackerConfigured,
  isBulkUnsubscribeConfigured,
  isAiAssistantConfigured,
}: {
  emailAccountId: string;
  isReplyTrackerConfigured: boolean;
  isBulkUnsubscribeConfigured: boolean;
  isAiAssistantConfigured: boolean;
}) {
  const steps = [
    isReplyTrackerConfigured,
    isBulkUnsubscribeConfigured,
    isAiAssistantConfigured,
  ];
  const completedSteps = steps.filter(Boolean);

  // Calculate progress percentage
  const totalSteps = steps.length;
  const completedCount = completedSteps.length;
  const progressPercentage = (completedCount / totalSteps) * 100;

  const isSetupComplete = progressPercentage === 100;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col p-6">
      <div className="mb-4 sm:mb-8">
        <PageHeading className="text-center">Welcome to Inbox Zero</PageHeading>
        <SectionDescription className="mt-2 text-center text-base">
          {isSetupComplete
            ? "What would you like to do?"
            : "Complete these steps to get the most out of Inbox Zero"}
        </SectionDescription>
      </div>

      {isSetupComplete ? (
        <FeatureGrid emailAccountId={emailAccountId} />
      ) : (
        <Checklist
          emailAccountId={emailAccountId}
          isReplyTrackerConfigured={isReplyTrackerConfigured}
          isBulkUnsubscribeConfigured={isBulkUnsubscribeConfigured}
          isAiAssistantConfigured={isAiAssistantConfigured}
          completedCount={completedCount}
          totalSteps={totalSteps}
          progressPercentage={progressPercentage}
        />
      )}
    </div>
  );
}

const StepItem = ({
  href,
  icon,
  iconBg,
  iconColor,
  title,
  // description,
  timeEstimate,
  completed,
  actionText,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  // description: string;
  timeEstimate: string;
  completed: boolean;
  actionText: string;
}) => {
  return (
    <Link
      className={`border-b border-border last:border-0 ${completed ? "opacity-60" : ""}`}
      href={href}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex max-w-lg items-center">
          <div
            className={`h-10 w-10 ${iconBg} mr-3 flex flex-shrink-0 items-center justify-center rounded-full`}
          >
            <div className={iconColor}>{icon}</div>
          </div>
          <div>
            <h3 className="font-medium text-foreground">{title}</h3>
            {/* <p className="text-sm text-muted-foreground">{description}</p> */}
            <p className="mt-0.5 text-xs text-muted-foreground/75">
              {timeEstimate}
            </p>
          </div>
        </div>

        <div className="flex items-center">
          {completed ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
              <CheckIcon
                size={14}
                className="text-green-600 dark:text-green-400"
              />
            </div>
          ) : (
            <div className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-600 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-900/75">
              {actionText}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

function Checklist({
  emailAccountId,
  completedCount,
  totalSteps,
  progressPercentage,
  isReplyTrackerConfigured,
  isBulkUnsubscribeConfigured,
  isAiAssistantConfigured,
}: {
  emailAccountId: string;
  completedCount: number;
  totalSteps: number;
  progressPercentage: number;
  isReplyTrackerConfigured: boolean;
  isBulkUnsubscribeConfigured: boolean;
  isAiAssistantConfigured: boolean;
}) {
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Complete your setup</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
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
        href={prefixPath(emailAccountId, "/assistant/onboarding")}
        icon={<BotIcon size={20} />}
        iconBg="bg-green-100 dark:bg-green-900/50"
        iconColor="text-green-500 dark:text-green-400"
        title="Set up your Personal Assistant"
        // description="Your personal email assistant that organizes, archives, and drafts replies based on your rules"
        timeEstimate="5 minutes"
        completed={isAiAssistantConfigured}
        actionText="Set up"
      />

      <StepItem
        href={prefixPath(emailAccountId, "/bulk-unsubscribe")}
        icon={<ArchiveIcon size={20} />}
        iconBg="bg-purple-100 dark:bg-purple-900/50"
        iconColor="text-purple-500 dark:text-purple-400"
        title="Unsubscribe from emails you don't read"
        // description="Easily unsubscribe from unwanted newsletters"
        timeEstimate="5 minutes"
        completed={isBulkUnsubscribeConfigured}
        actionText="View"
      />

      <StepItem
        href={prefixPath(emailAccountId, "/reply-zero")}
        icon={<MailIcon size={20} />}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-500 dark:text-blue-400"
        title="View emails needing replies"
        // description="Track emails needing replies & follow-ups. Get AI-drafted responses"
        timeEstimate="30 seconds"
        completed={isReplyTrackerConfigured}
        actionText="View"
      />
    </Card>
  );
}
