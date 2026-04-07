import {
  isImapProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

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
 * Gmail uses "labels", Outlook uses "categories", IMAP uses "folders"
 */
export function getEmailTerminology(provider: string): EmailTerminology {
  if (isMicrosoftProvider(provider)) {
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

  if (isImapProvider(provider)) {
    return {
      label: {
        singular: "folder",
        plural: "folders",
        singularCapitalized: "Folder",
        pluralCapitalized: "Folders",
        action: "Move to folder",
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
