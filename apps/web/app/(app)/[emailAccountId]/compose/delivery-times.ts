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
