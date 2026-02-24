import { internalDateToDate } from "@/utils/date";

type MessageTimestampInput = {
  internalDate?: string | null;
  date: string;
};

export function getMessageTimestamp(message: MessageTimestampInput): number {
  const internalDate = message.internalDate?.trim();
  if (internalDate) {
    const internalDateMs = internalDateToDate(internalDate, {
      fallbackToNow: false,
    }).getTime();
    if (!Number.isNaN(internalDateMs)) {
      return internalDateMs;
    }
  }

  const dateMs = new Date(message.date).getTime();
  if (!Number.isNaN(dateMs)) {
    return dateMs;
  }

  return 0;
}
