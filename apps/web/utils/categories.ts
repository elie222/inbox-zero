export const senderCategory = {
  UNKNOWN: {
    label: "Unknown",
    enabled: true,
    description:
      "Emails that don't fit any other category or can't be classified",
  },
  NEWSLETTER: {
    label: "Newsletter",
    enabled: true,
    description: "Newsletters",
  },
  MARKETING: {
    label: "Marketing",
    enabled: true,
    description:
      "Promotional emails, sales announcements, product launches, and marketing campaigns",
  },
  RECEIPT: {
    label: "Receipt",
    enabled: true,
    description:
      "Purchase confirmations, order receipts, and payment confirmations",
  },
  BANKING: {
    label: "Banking",
    enabled: true,
    description:
      "Bank statements, account updates, fraud alerts, and financial notifications",
  },
  LEGAL: {
    label: "Legal",
    enabled: true,
    description:
      "Terms of service updates, legal notices, contracts, and legal communications",
  },
  SUPPORT: {
    label: "Support",
    enabled: true,
    description: "Customer service responses",
  },
  PERSONAL: {
    label: "Personal",
    enabled: true,
    description: "Personal communications from friends and family",
  },
  WORK: {
    label: "Work",
    enabled: true,
    description: "Work-related communications",
  },
  SOCIAL: {
    label: "Social",
    enabled: true,
    description: "Notifications from social media platforms",
  },
  TRAVEL: {
    label: "Travel",
    enabled: true,
    description:
      "Flight itineraries, hotel reservations, and travel-related documents",
  },
  EVENTS: {
    label: "Events",
    enabled: true,
    description:
      "Event invitations, reminders, schedules, and registration information",
  },
  ACCOUNT: {
    label: "Account",
    enabled: true,
    description:
      "Account security notifications, password resets, and settings updates",
  },
  SHOPPING: {
    label: "Shopping",
    enabled: true,
    description:
      "Shopping updates, wishlist notifications, shipping updates, and retail communications",
  },
  EDUCATIONAL: {
    label: "Educational",
    enabled: false,
    description: "Courses and educational resources",
  },
  HEALTH: {
    label: "Health",
    enabled: false,
    description:
      "Medical appointments, lab results, prescriptions, and health-related notifications",
  },
  GOVERNMENT: {
    label: "Government",
    enabled: false,
    description:
      "Tax information, voter registration, government surveys, and official communications",
  },
  ENTERTAINMENT: {
    label: "Entertainment",
    enabled: false,
    description:
      "Updates from streaming services, gaming platforms, and entertainment providers",
  },
} as const;

export type SenderCategoryKey = keyof typeof senderCategory;
export type SenderCategoryValue = (typeof senderCategory)[SenderCategoryKey];
export type SenderCategory = SenderCategoryValue["label"];
