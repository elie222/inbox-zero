import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type MeetingBriefingEmailProps = {
  baseUrl: string;
  emailAccountId: string;
  meetingTitle: string;
  formattedDate: string; // e.g., "Friday, March 15"
  formattedTime: string; // e.g., "2:00 PM"
  videoConferenceLink?: string;
  eventUrl: string;
  briefingContent: string;
  guestCount: number;
  unsubscribeToken: string;
};

export default function MeetingBriefingEmail({
  baseUrl = "https://www.getinboxzero.com",
  emailAccountId,
  meetingTitle,
  formattedDate,
  formattedTime,
  videoConferenceLink,
  eventUrl,
  briefingContent,
  guestCount,
}: MeetingBriefingEmailProps) {
  // Convert briefing content to bullet points
  const briefingLines = briefingContent
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => line.trim().replace(/^[-•*]\s*/, ""));

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-white font-sans">
          <Container className="mx-auto w-full max-w-[600px] p-0">
            <Section className="p-4 text-center">
              <Link href={baseUrl} className="text-[15px]">
                <Img
                  src={"https://www.getinboxzero.com/icon.png"}
                  width="40"
                  height="40"
                  alt="Inbox Zero"
                  className="mx-auto my-0"
                />
              </Link>

              <Text className="mx-0 mb-8 mt-4 p-0 text-center text-2xl font-normal">
                <span className="font-semibold tracking-tighter">
                  Inbox Zero
                </span>
              </Text>

              <Heading className="my-4 text-3xl font-medium leading-tight">
                Meeting Briefing
              </Heading>
            </Section>

            {/* Meeting Details Card */}
            <Section className="px-4 mb-6">
              <div className="border border-solid border-gray-200 rounded-lg p-6 bg-gray-50">
                <Text className="text-xl font-semibold text-gray-900 mt-0 mb-2">
                  {meetingTitle}
                </Text>
                <Text className="text-base text-gray-600 mt-0 mb-4">
                  {formattedDate} at {formattedTime}
                </Text>
                <Text className="text-sm text-gray-500 mt-0 mb-0">
                  {guestCount} external guest{guestCount !== 1 ? "s" : ""}
                </Text>

                {/* Action Links */}
                <div className="mt-4 flex gap-4">
                  {videoConferenceLink && (
                    <Link
                      href={videoConferenceLink}
                      className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium no-underline"
                    >
                      Join Meeting
                    </Link>
                  )}
                  <Link
                    href={eventUrl}
                    className="inline-block bg-gray-200 text-gray-800 px-4 py-2 rounded-md text-sm font-medium no-underline"
                  >
                    View Event
                  </Link>
                </div>
              </div>
            </Section>

            {/* Briefing Content */}
            <Section className="px-4 mb-6">
              <Text className="text-lg font-semibold text-gray-900 mb-3">
                What you should know
              </Text>
              <div className="border-l-4 border-solid border-blue-400 bg-blue-50 rounded-r-lg p-4">
                <ul className="m-0 pl-4">
                  {briefingLines.map((line, index) => (
                    <li
                      key={index}
                      className="text-sm text-gray-800 mb-2 leading-relaxed"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </Section>

            <Hr className="border-solid border-gray-200 my-6" />

            {/* Footer */}
            <Section className="mt-4 text-center text-sm text-gray-500 px-4 pb-8">
              <Text className="m-0">
                You're receiving this briefing because you enabled Meeting
                Briefs in your Inbox Zero settings.
              </Text>
              <div className="mt-2">
                <Link
                  href={`${baseUrl}/${emailAccountId}/briefs`}
                  className="text-gray-500 underline"
                >
                  Manage settings
                </Link>
              </div>
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
  formattedDate: "Friday, March 15",
  formattedTime: "2:00 PM",
  videoConferenceLink: "https://meet.google.com/abc-defg-hij",
  eventUrl: "https://calendar.google.com/event/123",
  guestCount: 2,
  briefingContent: `**John Smith (john@acmecorp.com)**
- CEO of Acme Corp, joined 2019
- Last met 3 weeks ago for quarterly review
- Recent email: Discussed pricing for enterprise tier
- Interested in API integrations
- Decision maker for their team of 50+

**Sarah Johnson (sarah@acmecorp.com)**
- VP of Engineering at Acme Corp
- First time meeting this contact
- Technical evaluator for the deal`,
};

export function generateMeetingBriefingSubject(
  props: Pick<
    MeetingBriefingEmailProps,
    "meetingTitle" | "formattedTime" | "videoConferenceLink" | "eventUrl"
  >,
): string {
  const { meetingTitle, formattedTime, videoConferenceLink, eventUrl } = props;

  let subject = `Briefing for ${meetingTitle}, starting at ${formattedTime}`;

  if (videoConferenceLink) {
    subject += ` - Join: ${videoConferenceLink}`;
  }

  if (eventUrl) {
    subject += ` - Event: ${eventUrl}`;
  }

  return subject;
}
