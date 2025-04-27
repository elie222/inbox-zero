import { redirectToEmailAccountPath } from "@/utils/account";

export default async function SetupPage() {
  await redirectToEmailAccountPath("/setup");
}
