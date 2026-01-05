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

export type GuestBriefing = {
  name: string;
  email: string;
  bullets: string[];
};

export type InternalTeamMember = {
  name?: string;
  email: string;
};

export type BriefingContent = {
  guests: GuestBriefing[];
  internalTeamMembers?: InternalTeamMember[];
};

export type MeetingBriefingEmailProps = {
  baseUrl: string;
  emailAccountId: string;
  meetingTitle: string;
  formattedTime: string; // e.g., "2:00 PM"
  videoConferenceLink?: string;
  eventUrl: string;
  briefingContent: BriefingContent;
  unsubscribeToken: string;
};

function renderGuestBriefings(guests: GuestBriefing[]) {
  return guests.map((guest, guestIndex) => (
    <div key={`guest-${guestIndex}`} className={guestIndex > 0 ? "mt-4" : ""}>
      <Text className="text-sm text-gray-800 mt-0 mb-1">
        <strong>
          {guest.name} ({guest.email})
        </strong>
      </Text>
      {guest.bullets.map((bullet, bulletIndex) => (
        <Text
          key={`bullet-${guestIndex}-${bulletIndex}`}
          className="text-sm text-gray-800 mt-0 mb-0 pl-2"
        >
          - {bullet}
        </Text>
      ))}
    </div>
  ));
}

function renderInternalTeamNote(internalTeamMembers: InternalTeamMember[]) {
  if (internalTeamMembers.length === 0) return null;

  const names = internalTeamMembers
    .map((member) => member.name || member.email)
    .join(", ");

  return (
    <Text className="text-xs text-gray-500 mt-4 mb-0 italic">
      Also attending: {names} (internal team members - no briefing included)
    </Text>
  );
}

export default function MeetingBriefingEmail({
  baseUrl = "https://www.getinboxzero.com",
  emailAccountId,
  meetingTitle,
  formattedTime,
  videoConferenceLink,
  eventUrl,
  briefingContent,
}: MeetingBriefingEmailProps) {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            <Section className="px-8 pt-6 pb-2">
              <Text className="text-base text-gray-900 mt-0 mb-0">
                Briefing for <strong>{meetingTitle}</strong>
              </Text>
              <Text className="text-base text-gray-900 mt-0 mb-0">
                Starting at <strong>{formattedTime}</strong>
              </Text>
            </Section>

            <Section className="px-8 pt-2 pb-6">
              {videoConferenceLink && (
                <Text className="text-sm text-gray-700 mt-0 mb-2">
                  - Join link:{" "}
                  <Link
                    href={videoConferenceLink}
                    className="text-blue-600 underline"
                  >
                    {videoConferenceLink}
                  </Link>
                </Text>
              )}
              {eventUrl && (
                <Text className="text-sm text-gray-700 mt-0 mb-0">
                  - Calendar link:{" "}
                  <Link href={eventUrl} className="text-blue-600 underline">
                    {eventUrl}
                  </Link>
                </Text>
              )}
            </Section>

            <Section className="px-8 pb-4">
              {renderGuestBriefings(briefingContent.guests)}
              {briefingContent.internalTeamMembers &&
                renderInternalTeamNote(briefingContent.internalTeamMembers)}
            </Section>

            <Section className="px-8 pb-6">
              <Text className="text-xs text-gray-400 mt-0 mb-0 italic">
                Note: This briefing is AI-generated and may be inaccurate,
                especially for common names.
              </Text>
            </Section>

            <Hr className="border-solid border-gray-300 my-6 mx-8" />

            <Section className="px-8 pb-8">
              <Text className="text-xs text-gray-500 mt-0 mb-2">
                You're receiving this briefing because you enabled Meeting
                Briefs in your Inbox Zero settings.
              </Text>
              <Text className="text-xs text-gray-500 mt-0 mb-0">
                <Link
                  href={`${baseUrl}/${emailAccountId}/briefs`}
                  className="text-gray-600 underline"
                >
                  Manage settings
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

MeetingBriefingEmail.PreviewProps = {
  baseUrl: "https://www.getinboxzero.com",
  unsubscribeToken: "test-token",
  emailAccountId: "test-account",
  meetingTitle: "Product Strategy Review with Acme Corp",
  formattedTime: "2:00 PM",
  videoConferenceLink: "https://meet.google.com/abc-defg-hij",
  eventUrl: "https://calendar.google.com/event/123",
  briefingContent: {
    guests: [
      {
        name: "John Smith",
        email: "john@acmecorp.com",
        bullets: [
          "CEO of Acme Corp, joined 2019",
          "Last met 3 weeks ago for quarterly review",
          "Recent email: Discussed pricing for enterprise tier",
          "Interested in API integrations",
          "Decision maker for their team of 50+",
        ],
      },
      {
        name: "Sarah Johnson",
        email: "sarah@acmecorp.com",
        bullets: [
          "VP of Engineering at Acme Corp",
          "First time meeting this contact",
          "Technical evaluator for the deal",
        ],
      },
    ],
    internalTeamMembers: [
      { name: "Alice Chen", email: "alice@mycompany.com" },
      { name: "Bob Williams", email: "bob@mycompany.com" },
    ],
  },
};

export function generateMeetingBriefingSubject(
  props: Pick<MeetingBriefingEmailProps, "meetingTitle" | "formattedTime">,
): string {
  const { meetingTitle, formattedTime } = props;

  return `Briefing for ${meetingTitle}, starting at ${formattedTime}`;
}
