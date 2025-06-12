import { redirectToEmailAccountPath } from "@/utils/account";

export default async function DebugPage() {
  await redirectToEmailAccountPath("/debug");
}
