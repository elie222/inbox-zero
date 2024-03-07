const ctaKeywords = [
  "see more", // eg. "See more details"
  "view it", // eg. "View it on GitHub"
  "view reply",
  "view comment",
  "view question",
  "view message",
  "view in", // eg. "View in Airtable"
  "confirm", // eg. "Confirm subscription"
  "join the conversation", // eg. LinkedIn
  "go to console",
  "open messenger", // Facebook
  "open in", // eg. Slack
  "reply",
];

export function containsCtaKeyword(text: string) {
  return ctaKeywords.some((keyword) => text.includes(keyword));
}
