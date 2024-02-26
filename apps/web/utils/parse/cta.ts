const ctaKeywords = [
  "see more", // eg. "See more details" for Vercel
  "view it", // eg. "View it on GitHub"
  "confirm", // eg. "Confirm subscription"
  "join the conversation", // eg. "Join the conversation" for replies on LinkedIn
];

export function containsCtaKeyword(text: string) {
  return ctaKeywords.some((keyword) => text.includes(keyword));
}
