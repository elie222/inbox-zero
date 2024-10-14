import { PageHeading, TypographyP } from "@/components/Typography";
import { Steps } from "@/app/(app)/onboarding/Steps";
import { OnboardingBulkUnsubscriber } from "@/app/(app)/onboarding/OnboardingBulkUnsubscriber";
import { OnboardingColdEmailBlocker } from "@/app/(app)/onboarding/OnboardingColdEmailBlocker";
import { OnboardingAIEmailAssistant } from "@/app/(app)/onboarding/OnboardingEmailAssistant";

export default function OnboardingPage({
  searchParams,
}: {
  searchParams: { step: string };
}) {
  return (
    <div className="mx-auto mt-8 max-w-5xl">
      <PageHeading>Let's get you to Inbox Zero</PageHeading>
      <TypographyP>
        We'll help you get your inbox to zero and set you up with the tools you
        need to stay there.
      </TypographyP>

      <div className="my-8">
        <Steps
          steps={[
            {
              title: "Bulk Unsubscriber",
              description: "One-click unsubscribe from emails you never read.",
              content: <OnboardingBulkUnsubscriber />,
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              active: !searchParams.step || searchParams.step === "1",
            },
            {
              title: "AI Personal Assistant",
              description: "Tell the assistant how to handle incoming emails.",
              content: <OnboardingAIEmailAssistant />,
              videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
              active: searchParams.step === "2",
            },
            {
              title: "Cold Emailer Blocker",
              description:
                "Stop salespeople filling your inbox with cold emails",
              content: <OnboardingColdEmailBlocker />,
              active: searchParams.step === "3",
            },
          ]}
        />
      </div>
    </div>
  );
}
