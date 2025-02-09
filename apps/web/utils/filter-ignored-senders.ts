// NOTE: Can make this an array in the future
// const ignoredSenders = ["Reminder <reminder@superhuman.com>"];
// return ignoredSenders.includes(sender);
export function isIgnoredSender(sender: string) {
  // Superhuman adds reminder emails which are automatically filtered out within Superhuman
  return sender === "Reminder <reminder@superhuman.com>";
}
