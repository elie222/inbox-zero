import { PageHeading, TypographyP } from "@/components/Typography";
import { Steps } from "@/app/(app)/onboarding/Steps";
import { OnboardingBulkUnsubscriber } from "@/app/(app)/onboarding/OnboardingBulkUnsubscriber";
import { OnboardingColdEmailBlocker } from "@/app/(app)/onboarding/OnboardingColdEmailBlocker";
import { OnboardingAIEmailAssistant } from "@/app/(app)/onboarding/OnboardingEmailAssistant";
import { OnboardingFinish } from "@/app/(app)/onboarding/OnboardingFinish";

export const maxDuration = 120;

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: { step: string };
}) {
  return (
    <div className="mx-auto mt-8 w-full max-w-5xl">
      <div className="px-4 lg:px-0">
        <PageHeading>First steps to Inbox Zero</PageHeading>
        <TypographyP>
          Get to know Inbox Zero and set up your account.
        </TypographyP>
      </div>

      <div className="my-8">
        <Steps
          selectedStep={
            searchParams.step ? parseInt(searchParams.step) : undefined
          }
          steps={[
            {
              title: "Bulk Unsubscriber",
              description: "One-click unsubscribe from emails you never read.",
              content: <OnboardingBulkUnsubscriber />,
              videoId: "T1rnooV4OYc",
              active: !searchParams.step || searchParams.step === "1",
            },
            {
              title: "AI Personal Assistant",
              description: "Tell the assistant how to handle incoming emails.",
              content: <OnboardingAIEmailAssistant />,
              videoId: "1LSt3dyyZtQ",
              active: searchParams.step === "2",
            },
            {
              title: "Cold Emailer Blocker",
              description:
                "Stop salespeople filling your inbox with cold emails",
              content: <OnboardingColdEmailBlocker step={3} />,
              active: searchParams.step === "3",
            },
            {
              title: "Continue",
              description: "Get started with Inbox Zero",
              content: <OnboardingFinish />,
              active: searchParams.step === "4",
            },
          ]}
        />
      </div>
    </div>
  );
}
