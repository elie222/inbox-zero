const ctaKeywords = [
  "see more", // eg. "See more details" for Vercel
  "view it", // eg. "View it on GitHub"
  "confirm", // eg. "Confirm subscription"
];

export function containsCtaKeyword(text: string) {
  return ctaKeywords.some((keyword) => text.includes(keyword));
}
