const ctaKeywords = [
  "see more", // eg. "See more details"
  "view it", // eg. "View it on GitHub"
  "confirm", // eg. "Confirm subscription"
  "join the conversation", // eg. LinkedIn
  "go to console",
  "view reply",
  "view comment",
];

export function containsCtaKeyword(text: string) {
  return ctaKeywords.some((keyword) => text.includes(keyword));
}
