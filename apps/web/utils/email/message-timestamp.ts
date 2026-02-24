type MessageTimestampInput = {
  internalDate?: string | null;
  date: string;
};

export function getMessageTimestamp(message: MessageTimestampInput): number {
  const internalDateMs = Number.parseInt(message.internalDate || "", 10);
  if (!Number.isNaN(internalDateMs) && internalDateMs > 0) {
    return internalDateMs;
  }

  const dateMs = new Date(message.date).getTime();
  if (!Number.isNaN(dateMs)) {
    return dateMs;
  }

  return 0;
}
