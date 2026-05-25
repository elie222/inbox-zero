"use client";

import { Container } from "@/components/Container";
import { PageHeading, MutedText, TextLink } from "@/components/Typography";
import { StepInboxProcessedView } from "@/app/(app)/[emailAccountId]/onboarding/StepInboxProcessed";
import type { GetOnboardingProcessedEmailsResponse } from "@/app/api/user/onboarding/processed-emails/route";
import { SystemType } from "@/generated/prisma/enums";
import { getRuleLabel } from "@/utils/rule/consts";

export default function OnboardingComponentsPage() {
  return (
    <Container>
      <div className="space-y-10 py-8">
        <div>
          <PageHeading>Onboarding Components</PageHeading>
          <MutedText className="mt-2">
            Storybook page for onboarding-specific UI.
          </MutedText>
          <div className="mt-4">
            <TextLink href="/components">← Back to all components</TextLink>
          </div>
        </div>

        <div>
          <div className="underline">
            StepInboxProcessed — all system categories
          </div>
          <MutedText className="mt-1">
            One example per `SystemType`, alphabetized by label, so every badge
            color is visible at once.
          </MutedText>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={getAllSystemCategoriesMock()}
              isLoading={false}
              isPremium={true}
              provider="google"
            />
          </div>
        </div>

        <div>
          <div className="underline">StepInboxProcessed — Gmail (premium)</div>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={getMockProcessedEmails()}
              isLoading={false}
              isPremium={true}
              provider="google"
            />
          </div>
        </div>

        <div>
          <div className="underline">
            StepInboxProcessed — Outlook (categories/folders terminology)
          </div>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={getMockProcessedEmails()}
              isLoading={false}
              isPremium={true}
              provider="microsoft"
            />
          </div>
        </div>

        <div>
          <div className="underline">
            StepInboxProcessed — free user (shows upgrade line)
          </div>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={getMockProcessedEmails()}
              isLoading={false}
              isPremium={false}
              provider="google"
            />
          </div>
        </div>

        <div>
          <div className="underline">StepInboxProcessed — loading state</div>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={undefined}
              isLoading={true}
              isPremium={true}
              provider="google"
            />
          </div>
        </div>

        <div>
          <div className="underline">
            StepInboxProcessed — empty fallback (Gmail)
          </div>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={{ totalCount: 0, draftCount: 0, emails: [] }}
              isLoading={false}
              isPremium={true}
              provider="google"
            />
          </div>
        </div>

        <div>
          <div className="underline">
            StepInboxProcessed — empty fallback (Outlook)
          </div>
          <div className="mt-4">
            <OnboardingCompleteDemo
              data={{ totalCount: 0, draftCount: 0, emails: [] }}
              isLoading={false}
              isPremium={true}
              provider="microsoft"
            />
          </div>
        </div>
      </div>
    </Container>
  );
}

function OnboardingCompleteDemo({
  data,
  isLoading,
  isPremium,
  provider,
}: {
  data: GetOnboardingProcessedEmailsResponse | undefined;
  isLoading: boolean;
  isPremium: boolean;
  provider: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border bg-slate-50 px-4 py-10">
      <StepInboxProcessedView
        data={data}
        isLoading={isLoading}
        isPremium={isPremium}
        provider={provider}
        onNext={() => {}}
      />
    </div>
  );
}

const NOW = Date.now();
const hoursAgo = (n: number) =>
  new Date(NOW - n * 60 * 60 * 1000).toISOString();
const daysAgo = (n: number) =>
  new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

type MockSample = {
  systemType: SystemType;
  sender: string;
  subject: string;
  date: string;
  hasDraft?: boolean;
};

function buildMockResponse(
  idPrefix: string,
  samples: MockSample[],
): GetOnboardingProcessedEmailsResponse {
  const emails = samples.map((sample, index) => ({
    messageId: `${idPrefix}-${index}`,
    systemType: sample.systemType,
    label: getRuleLabel(sample.systemType),
    sender: sample.sender,
    subject: sample.subject,
    date: sample.date,
    hasDraft: sample.hasDraft ?? false,
  }));

  return {
    totalCount: emails.length,
    draftCount: emails.filter((e) => e.hasDraft).length,
    emails,
  };
}

function getMockProcessedEmails(): GetOnboardingProcessedEmailsResponse {
  return buildMockResponse("mock", [
    {
      systemType: SystemType.TO_REPLY,
      sender: "Sarah Chen",
      subject: "Re: design review on Thursday",
      date: hoursAgo(2),
      hasDraft: true,
    },
    {
      systemType: SystemType.NEWSLETTER,
      sender: "TechNews Daily",
      subject: "Your Monday digest",
      date: hoursAgo(3),
    },
    {
      systemType: SystemType.MARKETING,
      sender: "Notion",
      subject: "New in Notion: AI blocks for everyone",
      date: hoursAgo(4),
    },
    {
      systemType: SystemType.NEWSLETTER,
      sender: "Stratechery",
      subject: "The platform shift nobody saw coming",
      date: daysAgo(1),
    },
    {
      systemType: SystemType.TO_REPLY,
      sender: "Alex Park",
      subject: "Quick question about onboarding",
      date: daysAgo(1),
      hasDraft: true,
    },
    {
      systemType: SystemType.MARKETING,
      sender: "Linear",
      subject: "Try our new Cycles workflow",
      date: daysAgo(2),
    },
    {
      systemType: SystemType.NEWSLETTER,
      sender: "Lenny's Newsletter",
      subject: "How great PMs run weekly planning",
      date: daysAgo(3),
    },
    {
      systemType: SystemType.NEWSLETTER,
      sender: "Morning Brew",
      subject: "Markets had a weekend",
      date: daysAgo(4),
    },
    {
      systemType: SystemType.MARKETING,
      sender: "Figma",
      subject: "You're invited to Config 2026",
      date: daysAgo(5),
    },
    {
      systemType: SystemType.NEWSLETTER,
      sender: "Not Boring",
      subject: "The seven companies that matter",
      date: daysAgo(6),
    },
  ]);
}

function getAllSystemCategoriesMock(): GetOnboardingProcessedEmailsResponse {
  const samples: Omit<MockSample, "date">[] = [
    {
      systemType: SystemType.ACTIONED,
      sender: "Priya Sharma",
      subject: "Re: Thanks, all sorted!",
    },
    {
      systemType: SystemType.AWAITING_REPLY,
      sender: "Marcus Lee",
      subject: "Following up on the contract",
    },
    {
      systemType: SystemType.CALENDAR,
      sender: "Google Calendar",
      subject: "Invitation: Product sync @ Thu 3pm",
    },
    {
      systemType: SystemType.COLD_EMAIL,
      sender: "Jordan Reyes",
      subject: "Quick intro: helping companies like yours",
    },
    {
      systemType: SystemType.FYI,
      sender: "Team Updates",
      subject: "Weekly engineering summary",
    },
    {
      systemType: SystemType.MARKETING,
      sender: "Notion",
      subject: "New in Notion: AI blocks for everyone",
    },
    {
      systemType: SystemType.NEWSLETTER,
      sender: "TechNews Daily",
      subject: "Your Monday digest",
    },
    {
      systemType: SystemType.NOTIFICATION,
      sender: "GitHub",
      subject: "PR #482 has new comments",
    },
    {
      systemType: SystemType.RECEIPT,
      sender: "Stripe",
      subject: "Your receipt from Acme Inc.",
    },
    {
      systemType: SystemType.TO_REPLY,
      sender: "Sarah Chen",
      subject: "Re: design review on Thursday",
      hasDraft: true,
    },
  ];

  return buildMockResponse(
    "category",
    samples.map((sample, index) => ({
      ...sample,
      date: index < 3 ? hoursAgo(index + 1) : daysAgo(index - 2),
    })),
  );
}
