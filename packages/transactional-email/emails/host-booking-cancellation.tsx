import { Section, Text } from "@react-email/components";
import { BookingEmailLayout } from "./components/booking-email-layout";

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
    <BookingEmailLayout
      headline={`${guestName} canceled their booking`}
      subline={formattedTime}
    >
      <Text className="m-0 mb-4 text-[14px] text-gray-700">
        <strong>{eventTitle}</strong> with {guestName} ({guestEmail}) was
        canceled and removed from your calendar.
      </Text>

      {reason ? (
        <Section className="rounded-r-lg border-l-[3px] border-gray-300 bg-[#FAFBFD] px-4 py-3">
          <Text className="m-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Reason
          </Text>
          <Text className="m-0 mt-1 text-[13px] text-gray-900">{reason}</Text>
        </Section>
      ) : null}
    </BookingEmailLayout>
  );
}

HostBookingCancellationEmail.PreviewProps = {
  eventTitle: "15 min intro",
  formattedTime: "Thu, Nov 12, 2026 · 10:00 AM",
  guestEmail: "sarah@acme.co",
  guestName: "Sarah Chen",
  reason: "Plans changed",
} satisfies HostBookingCancellationEmailProps;
