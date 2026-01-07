import {
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

  // Default icon for "Other" and any other category
  return MailIcon;
}
