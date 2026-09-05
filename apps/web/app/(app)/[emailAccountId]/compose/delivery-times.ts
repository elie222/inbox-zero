export function getReminderAfterSendTimeChange(
  sendAt: string,
  remindAt: string,
) {
  if (
    sendAt &&
    remindAt &&
    new Date(sendAt).getTime() >= new Date(remindAt).getTime()
  ) {
    return "";
  }
  return remindAt;
}

export function parseDeliveryTimes(
  sendAt: string,
  remindAt: string,
):
  | { valid: false; error: string }
  | { valid: true; sendAt: string | null; remindAt: string | null } {
  const sendDate =
    typeof sendAt === "string" && sendAt ? new Date(sendAt) : null;
  const reminderDate =
    typeof remindAt === "string" && remindAt ? new Date(remindAt) : null;
  if (
    typeof sendAt !== "string" ||
    (sendDate && !Number.isFinite(sendDate.getTime()))
  ) {
    return {
      valid: false,
      error: "Choose a valid send time, or clear Send later to send now.",
    };
  }
  if (
    typeof remindAt !== "string" ||
    (reminderDate && !Number.isFinite(reminderDate.getTime()))
  ) {
    return {
      valid: false,
      error: "Choose a valid reminder time, or clear the reminder.",
    };
  }
  return {
    valid: true,
    sendAt: sendDate?.toISOString() ?? null,
    remindAt: reminderDate?.toISOString() ?? null,
  };
}
