import { isMicrosoftProvider } from "@/utils/email/provider-types";

interface EmailTerminology {
  label: {
    singular: string;
    plural: string;
    singularCapitalized: string;
    pluralCapitalized: string;
    action: string;
  };
}

/**
 * Get email terminology based on the provider
 * Gmail uses "labels" while Outlook uses "categories"
 */
export function getEmailTerminology(provider: string): EmailTerminology {
  const isOutlook = isMicrosoftProvider(provider);

  if (isOutlook) {
    return {
      label: {
        singular: "category",
        plural: "categories",
        singularCapitalized: "Category",
        pluralCapitalized: "Categories",
        action: "Categorize",
      },
    };
  }

  // Default to Gmail terminology
  return {
    label: {
      singular: "label",
      plural: "labels",
      singularCapitalized: "Label",
      pluralCapitalized: "Labels",
      action: "Label",
    },
  };
}
