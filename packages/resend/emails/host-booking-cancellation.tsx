import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { InboxZeroFooter } from "./components/inbox-zero-footer";

export type HostBookingCancellationEmailProps = {
  eventTitle: string;
  formattedTime: string;
  guestEmail: string;
  guestName: string;
  reason?: string | null;
};

export default function HostBookingCancellationEmail({
  eventTitle,
  formattedTime,
  guestEmail,
  guestName,
  reason,
}: HostBookingCancellationEmailProps) {
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
                {guestName} canceled their booking
              </Heading>
              <Text className="m-0 mt-1 text-[13px] text-gray-500">
                {formattedTime}
              </Text>
            </Section>

            <Section className="px-8 pb-6 pt-2">
              <Text className="m-0 mb-4 text-[14px] text-gray-700">
                <strong>{eventTitle}</strong> with {guestName} ({guestEmail})
                was canceled and removed from your calendar.
              </Text>

              {reason ? (
                <Section className="rounded-r-lg border-l-[3px] border-gray-300 bg-[#FAFBFD] px-4 py-3">
                  <Text className="m-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Reason
                  </Text>
                  <Text className="m-0 mt-1 text-[13px] text-gray-900">
                    {reason}
                  </Text>
                </Section>
              ) : null}
            </Section>

            <InboxZeroFooter />
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

HostBookingCancellationEmail.PreviewProps = {
  eventTitle: "15 min intro",
  formattedTime: "Thu, Nov 12, 2026 · 10:00 AM",
  guestEmail: "sarah@acme.co",
  guestName: "Sarah Chen",
  reason: "Plans changed",
} satisfies HostBookingCancellationEmailProps;
