import { Section, Text } from "@react-email/components";
import { BookingEmailLayout } from "./components/booking-email-layout";

export type HostBookingRescheduledEmailProps = {
  eventTitle: string;
  formattedTime: string;
  previousFormattedTime: string;
  guestEmail: string;
  guestName: string;
  location?: string | null;
  dateMonth?: string;
  dateDay?: string;
  dateWeekday?: string;
  timeRange?: string;
  timezoneLabel?: string;
};

export default function HostBookingRescheduledEmail({
  eventTitle,
  formattedTime,
  previousFormattedTime,
  guestEmail,
  guestName,
  location,
  dateMonth,
  dateDay,
  dateWeekday,
  timeRange,
  timezoneLabel,
}: HostBookingRescheduledEmailProps) {
  return (
    <BookingEmailLayout
      headline={`${guestName} rescheduled their booking`}
      subline={formattedTime}
    >
      <Section className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <Text className="m-0 text-[13px] text-amber-800">
          Previously: <strong>{previousFormattedTime}</strong>
        </Text>
      </Section>

      <Section className="mb-5 overflow-hidden rounded-2xl border border-gray-200">
        <Section className="bg-[#FAFBFD] px-6 py-4">
          <table>
            <tr>
              {dateMonth && dateDay ? (
                <td className="pr-4">
                  <Section className="w-[60px] rounded-xl border border-gray-200 bg-white py-1.5 text-center">
                    <Text className="m-0 text-[10px] font-semibold uppercase tracking-wider text-red-600">
                      {dateMonth}
                    </Text>
                    <Text className="m-0 text-[22px] font-semibold leading-none text-gray-900">
                      {dateDay}
                    </Text>
                    {dateWeekday ? (
                      <Text className="m-0 mt-1 text-[10px] text-gray-500">
                        {dateWeekday}
                      </Text>
                    ) : null}
                  </Section>
                </td>
              ) : null}
              <td>
                <Text className="m-0 text-[16px] font-medium tracking-tight text-gray-900">
                  {eventTitle}
                </Text>
                {timeRange || timezoneLabel ? (
                  <Text className="m-0 mt-1 text-[13px] text-gray-600">
                    {[timeRange, timezoneLabel].filter(Boolean).join(" · ")}
                  </Text>
                ) : (
                  <Text className="m-0 mt-1 text-[13px] text-gray-600">
                    {formattedTime}
                  </Text>
                )}
              </td>
            </tr>
          </table>
        </Section>

        <Section className="px-6 py-3">
          <Text className="m-0 mb-1 text-[13px] text-gray-700">
            Guest: <strong>{guestName}</strong> ({guestEmail})
          </Text>
          {location ? (
            <Text className="m-0 text-[13px] text-gray-700">
              Location: <strong>{location}</strong>
            </Text>
          ) : null}
        </Section>
      </Section>

      <Text className="m-0 text-[13px] text-gray-600">
        Your calendar has been updated.
      </Text>
    </BookingEmailLayout>
  );
}

HostBookingRescheduledEmail.PreviewProps = {
  eventTitle: "15 min intro",
  formattedTime: "Fri, Nov 13, 2026 · 10:00 AM",
  previousFormattedTime: "Thu, Nov 12, 2026 · 10:00 AM",
  guestEmail: "sarah@acme.co",
  guestName: "Sarah Chen",
  location: "Google Meet",
  dateMonth: "NOV",
  dateDay: "13",
  dateWeekday: "Fri",
  timeRange: "10:00 AM – 10:15 AM",
  timezoneLabel: "Asia/Jerusalem",
} satisfies HostBookingRescheduledEmailProps;
