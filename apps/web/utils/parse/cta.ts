const ctaKeywords = [
  "see more", // eg. "See more details"
  "view it", // eg. "View it on GitHub"
  "view reply",
  "view comment",
  "view in", // eg. "View in Airtable"
  "confirm", // eg. "Confirm subscription"
  "join the conversation", // eg. LinkedIn
  "go to console",
];

export function containsCtaKeyword(text: string) {
  return ctaKeywords.some((keyword) => text.includes(keyword));
}
