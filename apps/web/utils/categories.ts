export const defaultCategory = {
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
} as const;

export type SenderCategoryKey = keyof typeof defaultCategory;
export type SenderCategoryValue = (typeof defaultCategory)[SenderCategoryKey];
export type SenderCategory = SenderCategoryValue["name"];
