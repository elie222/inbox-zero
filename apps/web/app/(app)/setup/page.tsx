import Link from "next/link";
import { Shield, Tag, Archive, Check, Zap } from "lucide-react";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
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

function SetupContent({
  isReplyTrackerConfigured,
  isColdEmailBlockerConfigured,
  isAiAssistantConfigured,
  isBulkUnsubscribeConfigured,
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

  return (
    <div className="bg-gray-50">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">
            Set up Inbox Zero
          </h1>
          <p className="text-gray-600">
            Complete these steps to get the most out of your email experience
          </p>
        </div>

        {/* Progress indicator */}
        <div className="mb-6 rounded-lg bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-gray-800">Setup progress</span>
            <span className="text-sm text-gray-600">
              {completedCount} of {totalSteps} completed
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-gray-200">
            <div
              className="h-2.5 rounded-full bg-blue-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Setup steps checklist */}
        <div className="mb-6 overflow-hidden rounded-lg bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <h2 className="font-semibold text-gray-800">Complete your setup</h2>
          </div>

          <StepItem
            href="/reply-zero"
            icon={<Zap size={20} />}
            iconBg="bg-blue-100"
            iconColor="text-blue-500"
            title="Enable Reply Zero"
            description="Track emails needing replies & follow-ups. Get AI-drafted responses"
            timeEstimate="30 seconds"
            completed={isReplyTrackerConfigured}
          />

          <StepItem
            href="/cold-email-blocker"
            icon={<Shield size={20} />}
            iconBg="bg-orange-100"
            iconColor="text-orange-500"
            title="Enable Cold Email Blocker"
            description="Filter out unsolicited messages"
            timeEstimate="30 seconds"
            completed={isColdEmailBlockerConfigured}
          />

          <StepItem
            href="/bulk-unsubscribe"
            icon={<Archive size={20} />}
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
            icon={<Tag size={20} />}
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

        {/* Future recommendations */}
        {/* <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex items-center mb-3">
            <Bell size={16} className="text-blue-500 mr-2" />
            <span className="font-semibold text-gray-800">
              Recommended after setup
            </span>
          </div>
          <p className="text-sm text-gray-600 mb-2">
            These additional features can be configured later from your
            settings.
          </p>
          <ul className="text-sm text-gray-700">
            <li className="mb-1 flex items-center">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2" />
              Connect your calendar for meeting scheduling
            </li>
            <li className="mb-1 flex items-center">
              <div className="w-1.5 h-1.5 bg-gray-400 rounded-full mr-2" />
              Set up follow-up reminders
            </li>
          </ul>
        </div> */}

        {/* <div className="flex justify-end">
          <button
            type="button"
            className="px-6 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
          >
            Go to Inbox
          </button>
        </div> */}
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
    <div className="border-b border-gray-100 last:border-0">
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
              <Check size={14} className="text-green-600" />
            </div>
          ) : (
            <Link
              href={href}
              target="_blank"
              className="rounded-md bg-blue-100 px-3 py-1 text-sm text-blue-600 hover:bg-blue-200"
            >
              {actionButton || "Enable"}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};
