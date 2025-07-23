import { redirectToEmailAccountPath } from "@/utils/account";

export default async function StatsPage() {
  await redirectToEmailAccountPath("/stats");
}
