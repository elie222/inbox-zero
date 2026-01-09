export const defaultCategory = {
  // Primary categories - used in rules and bulk archive UI
  OTHER: {
    name: "Other",
    enabled: true,
    description: "Senders that don't fit any other category",
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
  NOTIFICATION: {
    name: "Notification",
    enabled: true,
    description: "Automated alerts, system notifications, and status updates",
  },
  // TODO: Secondary categories for future two-round categorization
  // These would refine "Other" senders for analytics purposes.
  // Implementation: After primary categorization, if result is "Other",
  // make a second AI call with only secondary categories.
  // See: aiCategorizeSendersTwoRound in ai-categorize-senders.ts (commented out)
  //
  // BANKING: { name: "Banking", enabled: false, description: "Financial institutions, banks, and payment services" },
  // LEGAL: { name: "Legal", enabled: false, description: "Legal notices, contracts, and legal communications" },
  // INVESTOR: { name: "Investor", enabled: false, description: "VCs, stock alerts, portfolio updates, cap table tools" },
  // PERSONAL: { name: "Personal", enabled: false, description: "Personal communications from friends and family" },
  // WORK: { name: "Work", enabled: false, description: "Professional contacts and work-related communications" },
  // TRAVEL: { name: "Travel", enabled: false, description: "Airlines, hotels, booking services" },
  // SUPPORT: { name: "Support", enabled: false, description: "Customer service and support" },
  // EVENTS: { name: "Events", enabled: false, description: "Event invitations and reminders" },
  // EDUCATIONAL: { name: "Educational", enabled: false, description: "Educational institutions and courses" },
  // HEALTH: { name: "Health", enabled: false, description: "Healthcare providers and medical services" },
  // GOVERNMENT: { name: "Government", enabled: false, description: "Government agencies and official communications" },
} as const;

export type SenderCategoryKey = keyof typeof defaultCategory;
export type SenderCategoryValue = (typeof defaultCategory)[SenderCategoryKey];
export type SenderCategory = SenderCategoryValue["name"];
