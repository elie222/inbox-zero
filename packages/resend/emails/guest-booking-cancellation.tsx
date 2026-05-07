import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export type GuestBookingCancellationEmailProps = {
  eventTitle: string;
  formattedTime: string;
  guestName: string;
  hostName: string;
  reason?: string | null;
};

export default function GuestBookingCancellationEmail({
  eventTitle,
  formattedTime,
  guestName,
  hostName,
  reason,
}: GuestBookingCancellationEmailProps) {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-[#EDEEF1] font-sans">
          <Container className="mx-auto my-7 w-full max-w-[600px] overflow-hidden rounded-2xl border border-[#E1E3E8] bg-white">
            <Section className="px-8 pb-3 pt-6">
              <Heading
                as="h1"
                className="m-0 text-[18px] font-medium tracking-tight text-gray-900"
              >
                Your meeting with {hostName} was canceled
              </Heading>
              <Text className="m-0 mt-1 text-[13px] text-gray-500">
                {formattedTime}
              </Text>
            </Section>

            <Section className="px-8 pb-6 pt-2">
              <Text className="mb-1 mt-0 text-[15px] text-gray-900">
                Hi {guestName},
              </Text>
              <Text className="m-0 mb-5 text-[15px] text-gray-900">
                The meeting <strong>{eventTitle}</strong> was canceled. The
                event has been removed from your calendar.
              </Text>

              {reason ? (
                <Section className="mb-5 rounded-r-lg border-l-[3px] border-gray-300 bg-[#FAFBFD] px-4 py-3">
                  <Text className="m-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Reason
                  </Text>
                  <Text className="m-0 mt-1 text-[13px] text-gray-900">
                    {reason}
                  </Text>
                </Section>
              ) : null}

              <Text className="m-0 text-[13px] text-gray-600">
                Want to reschedule? Reply to this email and we'll find a new
                time.
              </Text>
            </Section>

            <Hr className="m-0 border-gray-200" />
            <Section className="bg-[#FDFDFD] px-8 py-4">
              <Text className="m-0 text-[11px] text-gray-500">
                Sent via Inbox Zero
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

GuestBookingCancellationEmail.PreviewProps = {
  eventTitle: "15 min intro",
  formattedTime: "Thu, Nov 12, 2026 · 10:00 AM",
  guestName: "Sarah Chen",
  hostName: "Elie",
  reason: "Plans changed",
} satisfies GuestBookingCancellationEmailProps;
