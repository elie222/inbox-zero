import { PageHeading, TypographyP } from "@/components/Typography";
import { Steps } from "@/app/(app)/onboarding/Steps";
import { OnboardingBulkUnsubscriber } from "@/app/(app)/onboarding/OnboardingBulkUnsubscriber";
import { OnboardingColdEmailBlocker } from "@/app/(app)/onboarding/OnboardingColdEmailBlocker";
import { OnboardingAIEmailAssistant } from "@/app/(app)/onboarding/OnboardingEmailAssistant";
import { OnboardingFinish } from "@/app/(app)/onboarding/OnboardingFinish";

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: { step: string };
}) {
  return (
    <div className="mx-auto mt-8 max-w-5xl">
      <PageHeading>First steps to Inbox Zero</PageHeading>
      <TypographyP>Get to know Inbox Zero and set up your account.</TypographyP>

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
              content: <OnboardingColdEmailBlocker />,
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
