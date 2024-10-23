export const SenderCategory = {
  UNKNOWN: "unknown",
  NEWSLETTER: "newsletter",
  MARKETING: "marketing",
  RECEIPT: "receipt",
  FINANCE: "finance",
  LEGAL: "legal",
  SUPPORT: "support",
  PERSONAL: "personal",
  WORK: "work",
  SOCIAL: "social",
  TRANSACTIONAL: "transactional",
  EDUCATIONAL: "educational",
  TRAVEL: "travel",
  HEALTH: "health",
  GOVERNMENT: "government",
  CHARITY: "charity",
  ENTERTAINMENT: "entertainment",
} as const;

type SenderCategory = (typeof SenderCategory)[keyof typeof SenderCategory];

interface CategoryRule {
  category: SenderCategory;
  patterns: RegExp[];
  keywords?: string[];
}

const rules: CategoryRule[] = [
  {
    category: SenderCategory.NEWSLETTER,
    patterns: [/newsletter@/i, /updates@/i, /weekly@/i, /digest@/i],
    keywords: ["subscribe", "unsubscribe", "newsletter", "digest"],
  },
  {
    category: SenderCategory.RECEIPT,
    patterns: [/receipt@/i, /order@/i, /purchase@/i, /transaction@/i],
    keywords: [
      "receipt",
      "order confirmation",
      "purchase",
      "transaction",
      "your order",
      "invoice",
      "payment confirmation",
    ],
  },
  {
    category: SenderCategory.MARKETING,
    patterns: [/marketing@/i, /promotions@/i, /offers@/i, /sales@/i],
    keywords: ["offer", "discount", "sale", "limited time", "exclusive"],
  },
  // {
  //   category: SenderCategory.CUSTOMER_SERVICE,
  //   patterns: [/support@/i, /help@/i, /customerservice@/i, /care@/i],
  //   keywords: ["ticket", "case", "inquiry", "support"],
  // },
  {
    category: SenderCategory.LEGAL,
    patterns: [/legal@/i, /compliance@/i, /notices@/i],
    keywords: ["agreement", "terms", "policy", "compliance"],
  },
  {
    category: SenderCategory.FINANCE,
    patterns: [/billing@/i, /payments@/i, /accounting@/i, /invoice@/i],
    keywords: ["payment", "invoice", "receipt", "statement", "bill"],
  },
];

export const categorizeSender = (
  email: string,
  name: string,
  subjectLines: string[],
  contents: string[],
) => {
  // 1. check if the sender matches a hard coded pattern
  // 1a. check if the sender is a newsletter
  // 1b. check if the sender is a receipt
  // 2. if not, send the sender to the ai. do we want to do this in batches? to save on tokens?
  // we will need to send email contents too
  // // Check each rule
  // const matchedRule = rules.find((rule) => {
  //   // Check email patterns
  //   const hasMatchingPattern = rule.patterns.some((pattern) =>
  //     pattern.test(email.toLowerCase()),
  //   );
  //   if (hasMatchingPattern) return true;
  //   // Check keywords in subject lines
  //   if (rule.keywords && subjectLines.length > 0) {
  //     const hasMatchingKeyword = subjectLines.some((subject) =>
  //       rule.keywords!.some((keyword) =>
  //         subject.toLowerCase().includes(keyword.toLowerCase()),
  //       ),
  //     );
  //     if (hasMatchingKeyword) return true;
  //   }
  //   return false;
  // });
  // if (matchedRule) {
  //   return matchedRule.category;
  // }
  // // Check for personal email indicators
  // const personalIndicators = [
  //   // No company domain
  //   !/.com|.org|.net|.edu|.gov/i.test(email),
  //   // Uses a personal email service
  //   /@gmail.|@yahoo.|@hotmail.|@outlook./i.test(email),
  //   // Display name looks like a person's name (basic check)
  //   /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(name),
  // ];
  // if (personalIndicators.filter(Boolean).length >= 2) {
  //   return SenderCategory.PERSONAL;
  // }
  // return SenderCategory.UNKNOWN;
};
