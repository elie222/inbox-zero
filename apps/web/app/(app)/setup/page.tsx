import Link from "next/link";
import {
  ArchiveIcon,
  CheckIcon,
  MailIcon,
  BanIcon,
  BotIcon,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { PageHeading } from "@/components/Typography";
import { LoadStats } from "@/providers/StatLoaderProvider";

export default async function SetupPage() {
  const session = await auth();
  const userId = session?.user.id;
  if (!userId) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      coldEmailBlocker: true,
      rules: { select: { trackReplies: true } },
      newsletters: {
        where: { status: { not: null } },
        take: 1,
      },
    },
  });

  if (!user) throw new Error("User not found");

  const isReplyTrackerConfigured = user.rules.some((rule) => rule.trackReplies);
  const isColdEmailBlockerConfigured = !!user.coldEmailBlocker;
  const isAiAssistantConfigured = user.rules.some((rule) => !rule.trackReplies);
  const isBulkUnsubscribeConfigured = user.newsletters.length > 0;

  return (
    <>
      <SetupContent
        isReplyTrackerConfigured={isReplyTrackerConfigured}
        isColdEmailBlockerConfigured={isColdEmailBlockerConfigured}
        isAiAssistantConfigured={isAiAssistantConfigured}
        isBulkUnsubscribeConfigured={isBulkUnsubscribeConfigured}
      />
      <LoadStats loadBefore showToast={false} />
    </>
  );
}

function FeatureCard({
  href,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="h-full rounded-lg bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
        <div
          className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full ${iconBg}`}
        >
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <h3 className="mb-2 text-lg font-medium text-gray-800">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </Link>
  );
}

const features = [
  {
    href: "/reply-zero",
    icon: MailIcon,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    title: "Reply Zero",
    description:
      "Track emails needing replies & follow-ups. Get AI-drafted responses",
  },
  {
    href: "/bulk-unsubscribe",
    icon: ArchiveIcon,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    title: "Bulk Unsubscribe",
    description: "Easily unsubscribe from unwanted newsletters in one click",
  },
  {
    href: "/automation",
    icon: BotIcon,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    title: "AI Assistant",
    description:
      "Your personal email assistant that organizes, archives, and drafts replies",
  },
  {
    href: "/cold-email-blocker",
    icon: BanIcon,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    title: "Cold Email Blocker",
    description: "Filter out unsolicited messages and keep your inbox clean",
  },
] as const;

function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4">
      {features.map((feature) => (
        <FeatureCard key={feature.href} {...feature} />
      ))}
    </div>
  );
}

function SetupContent({
  isReplyTrackerConfigured,
  isColdEmailBlockerConfigured,
  isBulkUnsubscribeConfigured,
  isAiAssistantConfigured,
}: {
  isReplyTrackerConfigured: boolean;
  isColdEmailBlockerConfigured: boolean;
  isBulkUnsubscribeConfigured: boolean;
  isAiAssistantConfigured: boolean;
}) {
  const steps = [
    isReplyTrackerConfigured,
    isColdEmailBlockerConfigured,
    isBulkUnsubscribeConfigured,
    isAiAssistantConfigured,
  ];
  const completedSteps = steps.filter(Boolean);

  // Calculate progress percentage
  const totalSteps = steps.length;
  const completedCount = completedSteps.length;
  const progressPercentage = (completedCount / totalSteps) * 100;

  // force light mode on this for now
  return (
    <div className="bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col p-6">
        <div className="mb-4 sm:mb-8">
          <PageHeading className="text-center dark:text-slate-800">
            Welcome to Inbox Zero
          </PageHeading>
          {/* <SectionDescription className="text-base dark:text-slate-600">
            Complete these steps to get the most out of your email experience
          </SectionDescription> */}
        </div>

        <FeatureGrid />

        <Checklist
          isReplyTrackerConfigured={isReplyTrackerConfigured}
          isColdEmailBlockerConfigured={isColdEmailBlockerConfigured}
          isBulkUnsubscribeConfigured={isBulkUnsubscribeConfigured}
          isAiAssistantConfigured={isAiAssistantConfigured}
          completedCount={completedCount}
          totalSteps={totalSteps}
          progressPercentage={progressPercentage}
        />
      </div>
    </div>
  );
}

const StepItem = ({
  href,
  icon,
  iconBg,
  iconColor,
  title,
  description,
  timeEstimate,
  completed,
  actionButton,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  timeEstimate: string;
  completed: boolean;
  actionButton?: string;
}) => {
  return (
    <Link
      className={`border-b border-gray-100 last:border-0 ${completed ? "opacity-50" : ""}`}
      href={href}
      target="_blank"
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex max-w-lg items-center">
          <div
            className={`h-10 w-10 ${iconBg} mr-3 flex flex-shrink-0 items-center justify-center rounded-full`}
          >
            <div className={iconColor}>{icon}</div>
          </div>
          <div>
            <h3 className="font-medium text-gray-800">{title}</h3>
            <p className="text-sm text-gray-600">{description}</p>
            <p className="mt-1 text-xs text-gray-500">
              Estimated: {timeEstimate}
            </p>
          </div>
        </div>

        <div className="flex items-center">
          {completed ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
              <CheckIcon size={14} className="text-green-600" />
            </div>
          ) : (
            <div className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-600 hover:bg-blue-200">
              {actionButton || "Enable"}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

function Checklist({
  completedCount,
  totalSteps,
  progressPercentage,
  isReplyTrackerConfigured,
  isColdEmailBlockerConfigured,
  isBulkUnsubscribeConfigured,
  isAiAssistantConfigured,
}: {
  completedCount: number;
  totalSteps: number;
  progressPercentage: number;
  isReplyTrackerConfigured: boolean;
  isColdEmailBlockerConfigured: boolean;
  isBulkUnsubscribeConfigured: boolean;
  isAiAssistantConfigured: boolean;
}) {
  return (
    <div className="mb-6 mt-20 overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Complete your setup</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {completedCount} of {totalSteps} completed
            </span>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <StepItem
        href="/reply-zero"
        icon={<MailIcon size={20} />}
        iconBg="bg-blue-100"
        iconColor="text-blue-500"
        title="Enable Reply Zero"
        description="Track emails needing replies & follow-ups. Get AI-drafted responses"
        timeEstimate="30 seconds"
        completed={isReplyTrackerConfigured}
      />

      <StepItem
        href="/cold-email-blocker"
        icon={<BanIcon size={20} />}
        iconBg="bg-orange-100"
        iconColor="text-orange-500"
        title="Enable Cold Email Blocker"
        description="Filter out unsolicited messages"
        timeEstimate="30 seconds"
        completed={isColdEmailBlockerConfigured}
      />

      <StepItem
        href="/bulk-unsubscribe"
        icon={<ArchiveIcon size={20} />}
        iconBg="bg-purple-100"
        iconColor="text-purple-500"
        title="Unsubscribe from emails you don't read"
        description="Easily unsubscribe from unwanted newsletters"
        timeEstimate="5 minutes"
        completed={isBulkUnsubscribeConfigured}
        actionButton="View"
      />

      <StepItem
        href="/automation"
        icon={<BotIcon size={20} />}
        iconBg="bg-green-100"
        iconColor="text-green-500"
        title="Set up AI Assistant"
        description="Your personal email assistant that organizes, archives, and drafts replies based on your rules"
        timeEstimate="10 minutes"
        completed={isAiAssistantConfigured}
      />

      {/* <StepItem
    icon={<Tag size={20} />}
    iconBg="bg-green-100"
    iconColor="text-green-500"
    title="Enable Smart Categories"
    description="Auto-organize emails into intuitive categories"
    timeEstimate="0 seconds (auto-enabled)"
    completed={completedSteps.smartCategories}
    autoCompleted={true}
  /> */}

      {/* <StepItem
    icon={<X size={20} />}
    iconBg="bg-purple-100"
    iconColor="text-purple-500"
    title="Review unsubscribe suggestions"
    description="Easily unsubscribe from unwanted newsletters"
    timeEstimate="30 seconds"
    completed={completedSteps.bulkUnsubscribe}
    onClick={() => toggleStep("bulkUnsubscribe")}
    actionButton="Review"
  /> */}
    </div>
  );
}
