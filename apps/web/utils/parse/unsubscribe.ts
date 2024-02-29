const unsubscribeKeywords = [
  "unsubscribe",
  "email preferences",
  "email settings",
  "email options",
  "notification preferences",
];

export function containsUnsubscribeKeyword(text: string) {
  return unsubscribeKeywords.some((keyword) => text.includes(keyword));
}
