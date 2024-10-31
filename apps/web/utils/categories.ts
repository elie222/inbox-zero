export const defaultCategory = {
  UNKNOWN: {
    name: "Unknown",
    enabled: true,
    description:
      "Emails that don't fit any other category or can't be classified",
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
      "Promotional emails, sales announcements, product launches, and marketing campaigns",
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
      "Bank statements, account updates, fraud alerts, and financial notifications",
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
    description: "Customer service responses",
  },
  PERSONAL: {
    name: "Personal",
    enabled: true,
    description: "Personal communications from friends and family",
  },
  SOCIAL: {
    name: "Social",
    enabled: true,
    description: "Notifications from social media platforms",
  },
  TRAVEL: {
    name: "Travel",
    enabled: true,
    description:
      "Flight itineraries, hotel reservations, and travel-related documents",
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
    description: "Work-related communications",
  },
  EDUCATIONAL: {
    name: "Educational",
    enabled: false,
    description: "Courses and educational resources",
  },
  HEALTH: {
    name: "Health",
    enabled: false,
    description:
      "Medical appointments, lab results, prescriptions, and health-related notifications",
  },
  GOVERNMENT: {
    name: "Government",
    enabled: false,
    description:
      "Tax information, voter registration, government surveys, and official communications",
  },
  ENTERTAINMENT: {
    name: "Entertainment",
    enabled: false,
    description:
      "Updates from streaming services, gaming platforms, and entertainment providers",
  },
} as const;

export type SenderCategoryKey = keyof typeof defaultCategory;
export type SenderCategoryValue = (typeof defaultCategory)[SenderCategoryKey];
export type SenderCategory = SenderCategoryValue["name"];
