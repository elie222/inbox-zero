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

export type MeetingBriefingEmailProps = {
  baseUrl: string;
  emailAccountId: string;
  meetingTitle: string;
  formattedTime: string; // e.g., "2:00 PM"
  videoConferenceLink?: string;
  eventUrl: string;
  briefingContent: string;
  unsubscribeToken: string;
};

// Helper function to parse content and render with formatting
function renderFormattedContent(content: string) {
  const lines = content.split("\n");

  return lines.map((line, index) => {
    // Check if line contains **bold** markdown
    const parts: (string | React.ReactElement)[] = [];
    let lastIndex = 0;
    const boldRegex = /\*\*(.+?)\*\*/g;

    let match = boldRegex.exec(line);
    while (match !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(line.substring(lastIndex, match.index));
      }
      // Add the bold text
      parts.push(
        <strong key={`bold-${index}-${match.index}`}>{match[1]}</strong>,
      );
      lastIndex = match.index + match[0].length;
      match = boldRegex.exec(line);
    }

    // Add remaining text
    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }

    // If no bold formatting was found, just return the line
    if (parts.length === 0) {
      parts.push(line);
    }

    return (
      <span key={`line-${index}`}>
        {parts}
        {index < lines.length - 1 && <br />}
      </span>
    );
  });
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
                  - Event link:{" "}
                  <Link href={eventUrl} className="text-blue-600 underline">
                    {eventUrl}
                  </Link>
                </Text>
              )}
            </Section>

            <Section className="px-8 pb-6">
              <div className="text-sm text-gray-800 leading-relaxed">
                {renderFormattedContent(briefingContent)}
              </div>
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
  props: Pick<MeetingBriefingEmailProps, "meetingTitle" | "formattedTime">,
): string {
  const { meetingTitle, formattedTime } = props;

  return `Briefing for ${meetingTitle}, starting at ${formattedTime}`;
}
