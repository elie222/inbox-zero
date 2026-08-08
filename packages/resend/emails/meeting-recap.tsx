import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type MeetingRecapActionItem = {
  description: string;
  owner?: string | null;
};

export type MeetingRecapContent = {
  overview: string;
  keyDecisions: string[];
  actionItems: MeetingRecapActionItem[];
  openQuestions?: string[];
  nextSteps?: string[];
};

export type MeetingRecapEmailProps = {
  baseUrl: string;
  emailAccountId: string;
  meetingTitle: string;
  formattedTime: string;
  recap: MeetingRecapContent;
  followUpDraftCreated: boolean;
  unsubscribeToken: string;
};

function renderBulletSection(title: string, items: string[]) {
  if (items.length === 0) return null;

  return (
    <Section className="px-8 pb-4">
      <Text className="text-sm font-semibold text-gray-900 mt-0 mb-1">
        {title}
      </Text>
      {items.map((item, index) => (
        <Text
          key={`${title}-${index}`}
          className="text-sm text-gray-800 mt-0 mb-0 pl-2"
        >
          - {item}
        </Text>
      ))}
    </Section>
  );
}

export default function MeetingRecapEmail({
  baseUrl = "https://www.getinboxzero.com",
  emailAccountId,
  meetingTitle,
  formattedTime,
  recap,
  followUpDraftCreated,
}: MeetingRecapEmailProps) {
  const actionItems = recap.actionItems.map((item) =>
    item.owner ? `${item.owner}: ${item.description}` : item.description,
  );

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            <Section className="px-8 pt-6 pb-2">
              <Text className="text-base text-gray-900 mt-0 mb-0">
                Notes from <strong>{meetingTitle}</strong>
              </Text>
              <Text className="text-base text-gray-900 mt-0 mb-0">
                {formattedTime}
              </Text>
            </Section>

            <Section className="px-8 pt-2 pb-4">
              <Text className="text-sm text-gray-800 mt-0 mb-0">
                {recap.overview}
              </Text>
            </Section>

            {renderBulletSection("Decisions", recap.keyDecisions)}
            {renderBulletSection("Action items", actionItems)}
            {renderBulletSection("Open questions", recap.openQuestions ?? [])}
            {renderBulletSection("Next steps", recap.nextSteps ?? [])}

            {followUpDraftCreated && (
              <Section className="px-8 pb-4">
                <Text className="text-sm text-gray-700 mt-0 mb-0">
                  A follow-up email to the other attendees is waiting in your
                  drafts. Nothing has been sent.
                </Text>
              </Section>
            )}

            <Section className="px-8 pb-6">
              <Text className="text-xs text-gray-400 mt-0 mb-0 italic">
                These notes are AI-generated from an automatic transcript and
                may be inaccurate.
              </Text>
            </Section>

            <Hr className="border-solid border-gray-300 my-6 mx-8" />

            <Section className="px-8 pb-8">
              <Text className="text-xs text-gray-500 mt-0 mb-2">
                You're receiving these notes because you enabled the notetaker
                in your Inbox Zero settings.
              </Text>
              <Text className="text-xs text-gray-500 mt-0 mb-0">
                <Link
                  href={`${baseUrl}/${emailAccountId}/meetings`}
                  className="text-gray-600 underline"
                >
                  View meeting
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MeetingRecapEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  unsubscribeToken: "test-token",
  emailAccountId: "test-account",
  meetingTitle: "Product Strategy Review with Acme Corp",
  formattedTime: "Mon, May 4 at 2:00 PM",
  followUpDraftCreated: true,
  recap: {
    overview:
      "Acme walked through their rollout timeline and raised concerns about the enterprise tier's API limits. The team agreed to revisit pricing before the next call.",
    keyDecisions: [
      "Enterprise tier will include a higher API rate limit",
      "Rollout moves to the first week of June",
    ],
    actionItems: [
      { description: "Send the revised pricing sheet", owner: "Alice" },
      { description: "Confirm the security review timeline", owner: "John" },
      { description: "Share the migration checklist" },
    ],
    openQuestions: ["Who signs off on the security review?"],
    nextSteps: ["Reconvene next Thursday with the updated pricing"],
  },
} satisfies MeetingRecapEmailProps;

export function generateMeetingRecapSubject(
  props: Pick<MeetingRecapEmailProps, "meetingTitle">,
): string {
  return `Notes from ${props.meetingTitle}`;
}
