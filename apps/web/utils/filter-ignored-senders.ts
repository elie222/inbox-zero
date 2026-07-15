export function isIgnoredSender(sender: string) {
  // Superhuman adds reminder emails which are automatically filtered out within Superhuman
  return sender === "Reminder <reminder@superhuman.com>";
}
