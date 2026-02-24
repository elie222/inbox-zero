type MessageTimestampInput = {
  internalDate?: string | null;
  date: string;
};

export function getMessageTimestamp(message: MessageTimestampInput): number {
  const internalDate = message.internalDate?.trim();
  if (internalDate) {
    if (/^\d+$/.test(internalDate)) {
      const internalDateMs = Number.parseInt(internalDate, 10);
      if (internalDateMs > 0) {
        return internalDateMs;
      }
    }

    const internalDateMs = new Date(internalDate).getTime();
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
