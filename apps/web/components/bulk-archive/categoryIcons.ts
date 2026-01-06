import {
  BellIcon,
  BriefcaseIcon,
  CalendarIcon,
  CircleHelpIcon,
  CodeIcon,
  CreditCardIcon,
  GlobeIcon,
  HeadphonesIcon,
  MailIcon,
  MegaphoneIcon,
  NewspaperIcon,
  ReceiptIcon,
  ScaleIcon,
  ShoppingCartIcon,
  TagIcon,
  UserIcon,
  UserCircleIcon,
  UsersIcon,
} from "lucide-react";

export function getCategoryIcon(categoryName: string) {
  const name = categoryName.toLowerCase();

  if (name.includes("newsletter")) return NewspaperIcon;
  if (name.includes("marketing") || name.includes("promotion"))
    return MegaphoneIcon;
  if (name.includes("notification") || name.includes("alert")) return BellIcon;
  if (name.includes("receipt") || name.includes("invoice")) return ReceiptIcon;
  if (name.includes("social") || name.includes("team")) return UsersIcon;
  if (name.includes("shopping") || name.includes("order"))
    return ShoppingCartIcon;
  if (name.includes("finance") || name.includes("bank") || name.includes("pay"))
    return CreditCardIcon;
  if (name.includes("work") || name.includes("job") || name.includes("career"))
    return BriefcaseIcon;
  if (
    name.includes("developer") ||
    name.includes("github") ||
    name.includes("code")
  )
    return CodeIcon;
  if (name.includes("travel") || name.includes("flight")) return GlobeIcon;
  if (
    name.includes("sale") ||
    name.includes("deal") ||
    name.includes("discount")
  )
    return TagIcon;
  if (name.includes("uncategorized") || name.includes("unknown"))
    return CircleHelpIcon;
  if (
    name.includes("legal") ||
    name.includes("law") ||
    name.includes("contract")
  )
    return ScaleIcon;
  if (
    name.includes("support") ||
    name.includes("help") ||
    name.includes("customer")
  )
    return HeadphonesIcon;
  if (name.includes("personal") || name.includes("private")) return UserIcon;
  if (
    name.includes("event") ||
    name.includes("calendar") ||
    name.includes("meeting")
  )
    return CalendarIcon;
  if (name.includes("account") || name.includes("profile"))
    return UserCircleIcon;

  // Default icon
  return MailIcon;
}
