const ctaKeywords = [
  "see more", // e.g. "See more details"
  "view it", // e.g. "View it on GitHub"
  "view reply",
  "view comment",
  "view question",
  "view message",
  "view in", // e.g. "View in Airtable"
  "confirm", // e.g. "Confirm subscription"
  "join the conversation", // e.g. LinkedIn
  "go to console",
  "open messenger", // Facebook
  "open in", // e.g. Slack
  "reply",
];

export function containsCtaKeyword(text: string) {
  const maxLength = 30; // Avoid CTAs that are sentences
  return ctaKeywords.some(
    (keyword) => text.includes(keyword) && text.length < maxLength,
  );
}
