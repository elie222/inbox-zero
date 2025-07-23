import { redirectToEmailAccountPath } from "@/utils/account";

export default async function SmartCategoriesPage() {
  await redirectToEmailAccountPath("/smart-categories");
}
