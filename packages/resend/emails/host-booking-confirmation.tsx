import { Section, Text } from "@react-email/components";
import { BookingEmailLayout } from "./components/booking-email-layout";

export type HostBookingConfirmationEmailProps = {
  eventTitle: string;
  formattedTime: string;
  guestEmail: string;
  guestName: string;
  location?: string | null;
  dateMonth?: string;
  dateDay?: string;
  dateWeekday?: string;
  timeRange?: string;
  timezoneLabel?: string;
  guestNote?: string | null;
};

export default function HostBookingConfirmationEmail({
  eventTitle,
  formattedTime,
  guestEmail,
  guestName,
  location,
  dateMonth,
  dateDay,
  dateWeekday,
  timeRange,
  timezoneLabel,
  guestNote,
}: HostBookingConfirmationEmailProps) {
  return (
    <BookingEmailLayout
      headline={`New booking from ${guestName}`}
      subline={formattedTime}
    >
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

      {guestNote ? (
        <Section className="mb-6 rounded-r-lg border-l-[3px] border-blue-600 bg-[#FAFBFD] px-4 py-3">
          <Text className="m-0 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Their note
          </Text>
          <Text className="m-0 mt-1 text-[13px] italic text-gray-900">
            "{guestNote}"
          </Text>
        </Section>
      ) : null}

      <Text className="m-0 text-[13px] text-gray-600">
        The calendar provider will send the invite to attendees.
      </Text>
    </BookingEmailLayout>
  );
}

HostBookingConfirmationEmail.PreviewProps = {
  eventTitle: "15 min intro",
  formattedTime: "Thu, Nov 12, 2026 · 10:00 AM",
  guestEmail: "sarah@acme.co",
  guestName: "Sarah Chen",
  location: "Google Meet",
  dateMonth: "NOV",
  dateDay: "12",
  dateWeekday: "Thu",
  timeRange: "10:00 AM – 10:15 AM",
  timezoneLabel: "Asia/Jerusalem",
  guestNote:
    "Hey Elie, building a B2B email tool, would love to chat about your AI rules approach.",
} satisfies HostBookingConfirmationEmailProps;
