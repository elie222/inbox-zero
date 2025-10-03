import { redirectToEmailAccountPath } from "@/utils/account";

export default async function IntegrationsPage() {
  await redirectToEmailAccountPath("/integrations");
}
