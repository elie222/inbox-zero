import { redirectToEmailAccountPath } from "@/utils/account";

// Force dynamic rendering to avoid static generation issues
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await redirectToEmailAccountPath("/integrations");
}
