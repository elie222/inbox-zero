const unsubscribeKeywords = [
  "unsubscribe",
  "email preferences",
  "email settings",
  "email options",
  "notification preferences",
];

export function containsUnsubscribeKeyword(text: string) {
  const lowerText = text.toLowerCase();
  return unsubscribeKeywords.some((keyword) => lowerText.includes(keyword));
}
