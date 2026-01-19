import {
  BellIcon,
  MailIcon,
  MegaphoneIcon,
  NewspaperIcon,
  ReceiptIcon,
} from "lucide-react";

export function getCategoryIcon(categoryName: string) {
  const name = categoryName.toLowerCase();

  if (name.includes("newsletter")) return NewspaperIcon;
  if (name.includes("marketing")) return MegaphoneIcon;
  if (name.includes("receipt")) return ReceiptIcon;
  if (name.includes("notification")) return BellIcon;

  // Default icon for "Other" and any other category
  return MailIcon;
}

export function getCategoryStyle(categoryName: string) {
  const name = categoryName.toLowerCase();

  if (name.includes("newsletter")) {
    return {
      icon: NewspaperIcon,
      iconColor: "text-new-purple-600",
      borderColor: "from-new-purple-200 to-new-purple-300",
      gradient: "from-new-purple-50 to-new-purple-100",
    };
  }
  if (name.includes("marketing")) {
    return {
      icon: MegaphoneIcon,
      iconColor: "text-new-orange-600",
      borderColor: "from-new-orange-150 to-new-orange-200",
      gradient: "from-new-orange-50 to-new-orange-100",
    };
  }
  if (name.includes("receipt")) {
    return {
      icon: ReceiptIcon,
      iconColor: "text-new-green-500",
      borderColor: "from-new-green-150 to-new-green-200",
      gradient: "from-new-green-50 to-new-green-100",
    };
  }
  if (name.includes("notification")) {
    return {
      icon: BellIcon,
      iconColor: "text-new-blue-600",
      borderColor: "from-new-blue-150 to-new-blue-200",
      gradient: "from-new-blue-50 to-new-blue-100",
    };
  }
  if (name === "uncategorized") {
    return {
      icon: MailIcon,
      iconColor: "text-new-indigo-600",
      borderColor: "from-new-indigo-150 to-new-indigo-200",
      gradient: "from-new-indigo-50 to-new-indigo-100",
    };
  }
  // Default for "Other" and any other category
  return {
    icon: MailIcon,
    iconColor: "text-gray-500",
    borderColor: "from-gray-200 to-gray-300",
    gradient: "from-gray-50 to-gray-100",
  };
}
