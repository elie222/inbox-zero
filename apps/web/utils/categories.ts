export const defaultCategory = {
  UNKNOWN: {
    name: "Unknown",
    enabled: true,
    description:
      "Senders that don't fit any other category or can't be classified",
  },
  NEWSLETTER: {
    name: "Newsletter",
    enabled: true,
    description: "Newsletters",
  },
  MARKETING: {
    name: "Marketing",
    enabled: true,
    description:
      "Promotional content, product launches, and marketing campaigns",
  },
  RECEIPT: {
    name: "Receipt",
    enabled: true,
    description:
      "Purchase confirmations, order receipts, and payment confirmations",
  },
  BANKING: {
    name: "Banking",
    enabled: true,
    description:
      "Financial institutions, banks, and payment services that send statements and alerts",
  },
  LEGAL: {
    name: "Legal",
    enabled: true,
    description:
      "Terms of service updates, legal notices, contracts, and legal communications",
  },
  SUPPORT: {
    name: "Support",
    enabled: true,
    description: "Customer service and support",
  },
  PERSONAL: {
    name: "Personal",
    enabled: true,
    description: "Personal communications from friends and family",
  },
  SOCIAL: {
    name: "Social",
    enabled: true,
    description: "Social media platforms and their notification systems",
  },
  TRAVEL: {
    name: "Travel",
    enabled: true,
    description: "Airlines, hotels, booking services, and travel agencies",
  },
  EVENTS: {
    name: "Events",
    enabled: true,
    description:
      "Event invitations, reminders, schedules, and registration information",
  },
  ACCOUNT: {
    name: "Account",
    enabled: true,
    description:
      "Account security notifications, password resets, and settings updates",
  },
  SHOPPING: {
    name: "Shopping",
    enabled: false,
    description:
      "Shopping updates, wishlist notifications, shipping updates, and retail communications",
  },
  WORK: {
    name: "Work",
    enabled: false,
    description:
      "Professional contacts, colleagues, and work-related communications",
  },
  EDUCATIONAL: {
    name: "Educational",
    enabled: false,
    description:
      "Educational institutions, online learning platforms, and course providers",
  },
  HEALTH: {
    name: "Health",
    enabled: false,
    description:
      "Healthcare providers, medical offices, and health service platforms",
  },
  GOVERNMENT: {
    name: "Government",
    enabled: false,
    description:
      "Government agencies, departments, and official communication channels",
  },
  ENTERTAINMENT: {
    name: "Entertainment",
    enabled: false,
    description:
      "Streaming services, gaming platforms, and entertainment providers",
  },
} as const;

export type SenderCategoryKey = keyof typeof defaultCategory;
export type SenderCategoryValue = (typeof defaultCategory)[SenderCategoryKey];
export type SenderCategory = SenderCategoryValue["name"];
