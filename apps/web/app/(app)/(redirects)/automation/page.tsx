import { redirectToEmailAccountPath } from "@/utils/account";

export default async function AutomationPage() {
  await redirectToEmailAccountPath("/automation");
}
